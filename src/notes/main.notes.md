# `main.ts` 解读

> 配套文件：`src/main.ts`

## 文件原文

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import cookieSession from 'cookie-session';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.use(
    cookieSession({
      keys: ['mycv-secret-key'],
    }),
  );
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
    }),
  );
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
```

这是 Nest 应用的**进程入口**。整个程序从这一行 `await bootstrap()` 开始。

---

## 第 1~4 行：`import`

- `NestFactory` — 用来**创建 app 实例**（一个 `INestApplication`，在底层挂一个 Express）。
- `ValidationPipe` — Nest 内置的"请求体校验器"，配合 `class-validator` 注解用。
- `cookie-session` — 一个第三方 Express 中间件。名字看着像 session，但**不是** `express-session`。
- `AppModule` — 整个应用的**根模块**，根容器从这里拼。

---

## `bootstrap()`

```ts
async function bootstrap() {
  const app = await NestFactory.create(AppModule);                 // ①
  app.use(cookieSession({ keys: ['mycv-secret-key'] }));            // ②
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));      // ③
  await app.listen(process.env.PORT ?? 3000);                       // ④
}
```

### ① `NestFactory.create(AppModule)`

这一行做了**很多事**：

1. 读取 `AppModule` 上 `imports / controllers / providers` 的清单；
2. **递归**把这些模块拼成一张依赖图；
3. 实例化所有 provider（默认单例）；
4. 把 controller 路由注册到底层 Express 上；
5. 返回一个 `INestApplication`（类型即"基于 Express 的 Nest app"）。

注意：此时 HTTP server 还没起来——`listen()` 之前 `app.use()` 挂的中间件**有**效（IoC 容器注册完毕后还有一段 hook 时段），但**服务还没监听端口**。

### ② `cookieSession({ keys: ['mycv-secret-key'] })`

这是用来**在 cookie 里保存 session** 的中间件，是 `@Session()` 装饰器能注入值的根源。

#### 它和 `express-session` 的差别

| 维度 | `express-session` | **`cookie-session`**（你用这个） |
|---|---|---|
| 数据存在哪 | 服务端（store），cookie 里只放 sessionId | **客户端 cookie 里**整段 session 内容 |
| 大小限制 | 几乎不限 | 受 cookie 体积限制（≤ 4 KB） |
| 服务端状态 | 需要 session store（Redis/DB/内存） | **零状态**——无后端 |
| `req.session` | 普通对象 | 普通对象（同左） |
| 篡改防护 | 服务端持有真相 | 数据**加密 + 签名** |

**你每次写 `session.userId = 7` 时，7 会被加密进 cookie**，而不是到服务端的某张表里。这是无后端部署的最大优点。

#### `keys` 是 secret rotation 数组

`keys: ['mycv-secret-key']` 是一组轮换密钥：

- 索引 0 是当前加密/签名用；
- 索引 1+ 是"只用来验签/解密"。

这样你下次改 secret 时，旧 cookie 还能读，**新 cookie 用新 key**。生产起码给两把：`['current-secret', 'previous-secret']`。

#### 用了之后的变化

`req.session` 不再是 `undefined`，而是一个**普通 JS 对象**，任意读写。

### ③ `ValidationPipe({ whitelist: true })`

`whitelist: true` 意味着：`CreateUserDto` / `UpdateUserDto` 上**没有声明的字段从请求体里直接删除**。

它和 DTO 的关系：

```ts
class CreateUserDto {
  @IsEmail() email: string;
  @IsString() password: string;
}
```

前端 `POST /auth/signup { email, password, isAdmin: true }` → 由于 DTO 没 `isAdmin` 字段，它会被剥掉。如果你还想顺手报 400，推荐加 `forbidNonWhitelisted: true`：

```ts
new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,   // 多余字段 → 400
  transform: true,              // 自动把 plain JSON 转成 DTO 类实例
})
```

### ④ `app.listen(process.env.PORT ?? 3000)`

启动 HTTP server。前面所有 `app.use(...)`、路由注册、provider 初始化都在这一行**之前**完成。

注意：必须 `await`——否则程序就走完 `main.ts` 直接退出，server 会立刻收到 SIGTERM。

---

## `await bootstrap()`

模块顶层直接 `await` 调用。Node 14+ 已经支持 top-level await，启动后：

1. `await NestFactory.create(AppModule)` → 容器就绪
2. `app.use(...)` → 加中间件
3. `app.listen(...)` → server 真正监听端口
4. 函数返回，main.ts 退出，但 server 由 Node 事件循环接管

---

## 总结

`main.ts` 就干了三件事，按顺序：

1. **拼装** IoC 容器（`NestFactory.create`）
2. **挂中间件**（`cookie-session`、`ValidationPipe` 全局化）
3. **监听端口**（`app.listen`）

它决定了一个请求从"进来"到"被 controller 看到"之间，会经过哪些处理。

---

## 当前项目的潜在风险

⚠️ **secret 在源码里**：`keys: ['mycv-secret-key']` 写死在仓库里，git 历史会留下。生产前一定要移到环境变量：

```ts
keys: [process.env.COOKIE_KEY ?? 'dev-only-key'],
```

⚠️ **没有 `trust proxy` / `secure flag`**：生产部署在 nginx/Cloudflare 后时，要 `app.set('trust proxy', 1)`，否则 cookie 的 secure/sameSite 行为不对。

⚠️ **cookie 默认名是 `session`**：所有依赖 cookie 的测试必须知道这个名字。
