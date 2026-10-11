# `current-user.decorator.ts` 解读

> 配套文件：`src/users/decorators/current-user.decorator.ts`（8 行）

## 文件原文

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

这是一个**参数装饰器工厂**，用来把"取出当前登录用户"的逻辑封成可复用的 `@CurrentUser()`，让 controller 方法参数直接拿到 user 实体，而不必每次都手写 `@Session()` → 查 user 这一段。

下面逐行拆。

---

## 第 1 行：`import`

```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
```

- `createParamDecorator`：Nest 的"参数装饰器工厂"。`@Body()`、`@Param()`、`@Query()`、`@Session()` 都是用它做的。这里我们用同一把锤子为自己的业务场景造一个。
- `ExecutionContext`：Nest 对请求上下文的统一抽象。Nest 可以跑在 Express 或 Fastify 上，这个对象让同一段代码能在两个底层都工作。

---

## 第 3~8 行：工厂回调

```ts
export const CurrentUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
```

`createParamDecorator` 接一个**固定签名**的工厂回调：

| 参数 | 类型 | 含义 |
|---|---|---|
| `data` | `unknown` | 使用时 `@CurrentUser(...)` 里括号传入的内容。例如 `@CurrentUser('email')` → `data === 'email'` |
| `ctx` | `ExecutionContext` | 请求上下文，可访问不同协议的原生对象 |

### 第 5 行：`ctx.switchToHttp().getRequest()`

`ExecutionContext` 是一个多协议适配器。HTTP 层下：

```ts
ctx.switchToHttp()         // → HttpArgumentsHost
  .getRequest()            // → 原生 Express Request
  .getResponse()           // → 原生 Express Response
```

也可以 `switchToWs()`、`switchToRpc()`，但本项目是 HTTP。

这一行拿到的就是底层 Express 的 `req`，后面 `req.user` 是同一个 `req.user`。

### 第 6 行：`return request.user;` —— 整文件最关键的一句

**装饰器工厂返回什么，方法参数就是什么。** 也就是说：

```ts
@Get('/whoami')
whoAmI(@CurrentUser() user: User) {
  return user;
}
```

这里的 `user`，就是上面 `return request.user` 那一行返回的对象。Nest 不做任何加工，只把它塞进参数位置。

所以这个装饰器**只是个 reader**——它**不负责**给 `req.user` 写入内容。

### 谁往 `req.user` 上写？

这一步本来应该由一段**会话中间件 / Guard** 在路由前完成。例如：

```ts
@Injectable()
export class CurrentUserGuard implements CanActivate {
  constructor(private usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    if (req.session?.userId) {
      req.user = await this.usersService.findOne(req.session.userId);
    }
    return true;
  }
}
```

挂到 controller 上之后：

```ts
@Controller('auth')
@UseGuards(CurrentUserGuard)
@Serialize(UserDto)
export class UsersController {
  ...

  @Get('/whoami')
  whoAmI(@CurrentUser() user: User) {
    if (!user) throw new UnauthorizedException('not signed in');
    return user;
  }
}
```

**当前项目里这段 Guard 还没写**，所以 `@CurrentUser()` 现在拿到的是 `undefined`。

---

## `data` 参数为什么留空

回调的第一参数 `data` 当前没用，但**保留签名是对的**。将来需要"只取一个字段"时可以直接：

```ts
export const CurrentUser = createParamDecorator(
  (data: string, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.user?.[data] : request.user;
  },
);
```

然后 `@CurrentUser('email') email: string` 直接拿到 `request.user.email`。

---

## 和 `@Session()` 的关系

| 维度 | `@Session()` | `@CurrentUser()` |
|---|---|---|
| 注入值 | `req.session` | `req.user` |
| 谁写入 | `cookie-session` / `express-session` 中间件 | 你自己写的中间件 / Guard |
| 内容 | 你塞什么就有什么 | 一般是已查好的 User 实体 |
| 生命周期 | 与 session 同周期 | 与请求同周期（每请求重查） |

两者不是替代关系，而是**协作**：

```
session.userId = 7                ← 跨请求持续（在 cookie / store 里）
                ↓
Guard: req.user = usersService.findOne(7)   ← 当次请求可见
                ↓
@CurrentUser() user               ← 方法参数直接拿到
```

session 里**只**放 `userId`，把 user 实体在请求中重查——这是常见做法，因为 user 信息会变（改名、改邮箱），不应该被 cache 在 cookie 里。

---

## 总结

- 8 行代码，**只读** `req.user`，不承担"挂 user"的职责
- 是**抽象层**：把 `req.user → 方法参数` 这一步从 handler 里拿出
- "接电"靠 Guard / 中间件，本项目目前还没接
- 是 `@Session()` 的下一步演进；session 存 ID、装饰器拿 user，分工清楚
