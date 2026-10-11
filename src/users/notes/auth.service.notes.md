# `auth.service.ts` 解读

> 配套文件：`src/users/auth.service.ts`

## 文件原文

```ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(_scrypt);

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async signup(email: string, password: string) {
    const users = await this.usersService.find(email);
    if (users.length) {
      throw new BadRequestException('email in use');
    }

    const salt = randomBytes(8).toString('hex');
    const hash = (await scrypt(password, salt, 32)) as Buffer;
    const result = `${salt}.${hash.toString('hex')}`;
    const user = await this.usersService.create(email, result);
    return user;
  }

  async signin(email: string, password: string) {
    const [user] = await this.usersService.find(email);
    if (!user) {
      throw new BadRequestException('user not found');
    }

    const [salt, storedHash] = user.password.split('.');
    const hash = (await scrypt(password, salt, 32)) as Buffer;
    if (storedHash !== hash.toString('hex')) {
      throw new BadRequestException('bad password');
    }

    return user;
  }
}
```

这是**鉴权服务**。注意它**不**自己存任何东西，只把"密码如何哈希 / 校验"封装起来，配合 `UsersService` 完成注册与登录。

---

## 第 1 行起的 import

```ts
import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(_scrypt);
```

- `@Injectable()` 装饰类交给 Nest DI。
- `BadRequestException` —— 400 的内置 HTTP 异常。
- `crypto` 是 Node 内置模块。`scrypt` 是 CPU/内存密集型哈希算法，**比 bcrypt 更新，抗 GPU/ASIC 攻击**。原版 `scrypt` 是回调风格，被 `promisify` 包装成返回 Promise 的版本。
- `const scrypt = promisify(_scrypt)` —— 这一行是**模块顶层运行一次**。`promisify` 是个工具函数，把 `(err, val) => ...` 风格的函数转成 `Promise<val>`。转换之后的 `scrypt` 可直接 `await`。

⚠️ `as Buffer` 是**类型补丁**：`promisify` 没有把回调返回的类型透出来，你得告诉 TS 返回值是 `Buffer`。

---

## `signup` —— 注册流程

```ts
async signup(email: string, password: string) {
  const users = await this.usersService.find(email);
  if (users.length) {
    throw new BadRequestException('email in use');
  }

  const salt = randomBytes(8).toString('hex');
  const hash = (await scrypt(password, salt, 32)) as Buffer;
  const result = `${salt}.${hash.toString('hex')}`;
  const user = await this.usersService.create(email, result);
  return user;
}
```

### 三步详解

#### Step 1：查重

```ts
const users = await this.usersService.find(email);
if (users.length) {
  throw new BadRequestException('email in use');
}
```

业务上"email 不能重"。Database 字段 `email` 加了 `unique: true`（看 `user.entity.ts`），是个**安全网**——但**应用层**也得查重，否则报错信息会是 SQL 异常。两者并行做：
- App 层 -> 给前端友好提示；
- DB 层 -> 防止 race condition 漏过（两个并发注册同时通过 app 层校验）。

⚠️ 这里有个**Race condition**：两个并发的 `signup` 同 email 会同时通过 app 校验，DB 那个 `UNIQUE` 才会兜住——你正好有个兜底，是好的。

#### Step 2：生成 salt + hash

```ts
const salt = randomBytes(8).toString('hex');
const hash = (await scrypt(password, salt, 32)) as Buffer;
```

- `randomBytes(8)` —— 8 字节随机数，**16 个 hex 字符**。这是与每个 user 独立存的"盐"。
- `scrypt(password, salt, 32)` —— 以 (password, salt) 计算出 32 字节哈希。这是**慢**的，所以抗暴力破解。
- `as Buffer` —— 类型补丁（TS 不知道 promisify 返回什么）。

#### Step 3：把 `salt + hash` 拼成字符串入库

```ts
const result = `${salt}.${hash.toString('hex')}`;
const user = await this.usersService.create(email, result);
```

数据库里 `User.password` 一列（看 entity），存的字符串形如：

```
"a3f1c0b2e5d84716.7b2c..."
^^^^^^^                  ^^^
 salt         hash
```

⚠️ 这种"一列存 salt+hash"是学习版做法。生产更常见的：
1. `password` 列只存 hash；
2. `salt` 单独列、或 hash 字符串里嵌 salt。

什么时候分列好？当你要做"密码批量轮换"或"无需重 hash 改盐"时，分列方便。本项目只需要登录校验，一列就行。

### 关键的安全正确

| 决定 | 为什么 |
|---|---|
| **每个用户独立 salt** | 同样的密码在不同用户下 hash 不同，攻击者拿到 hash 表也无法批量破解 |
| **scrypt** 而不是 sha256 | sha256 太快，1 秒能跑几十亿次；scrypt 是故意慢的（~30 ms/次），让暴力破解不现实 |
| **不存原密码** | 数据库泄漏后也不会直接丢明文 |
| **给 hash 列定长** | scrypt 输出 32 字节（这里 `.toString('hex')` 后 64 字符），不会因输入长度变化 |

⚠️ 这个实现**还差**一步：

- 没有**常数时间比较**。`if (storedHash !== hash.toString('hex'))` 是**普通字符串比较**（短路）。攻击者可以通过比较时间推断前几位是否相同。
- 严格说要用 `crypto.timingSafeEqual(a, b)`：

```ts
import { timingSafeEqual } from 'crypto';
const stored = Buffer.from(storedHash, 'hex');
const computed = (await scrypt(password, salt, 32)) as Buffer;
if (stored.length !== computed.length || !timingSafeEqual(stored, computed)) {
  throw new BadRequestException('bad password');
}
```

这是工程细节。教程里不写，是因为现代编译器 / JIT 已经把字符串比较**多数**做成长度先比较然后 memcmp，**多数**安全。但你做密码学相关的事时，永远写 timing-safe 比较，对你自己是约束、对别人是 review 提示。

---

## `signin` —— 登录流程

```ts
async signin(email: string, password: string) {
  const [user] = await this.usersService.find(email);
  if (!user) throw new BadRequestException('user not found');

  const [salt, storedHash] = user.password.split('.');
  const hash = (await scrypt(password, salt, 32)) as Buffer;
  if (storedHash !== hash.toString('hex')) {
    throw new BadRequestException('bad password');
  }

  return user;
}
```

### 步骤对偶

```
signup 做的          signin 做的
─────────────────────────────────
随机 salt           取出已存的 salt
对 (pwd, salt) hash  对 (pwd, salt) hash
拼接 salt.hash       拼好字符串再 split 开
入库                比对两个 hash
```

`user.password.split('.')` —— "salt"和"hash"之间是 `.` 隔开的，split 成两段。剩下注释 (`auth.service.ts:42-46`) 反复强调 `as Buffer` 和 `toString('hex')`：必须在**编码层面一致才能比较**——你比较的是 hex 字符串，不是 Buffer。

### 错误返回的语义问题

```ts
if (!user) throw new BadRequestException('user not found');
...
if (storedHash !== hash.toString('hex')) {
  throw new BadRequestException('bad password');
}
```

⚠️ "用户不存在"和"密码错误"是**两种不同**的情况，给出**两种不同**的错误信息让攻击者能枚举 email 是否注册。

更好的做法是**统一**报 401 unauthorized：

```ts
throw new UnauthorizedException('invalid credentials');
```

这样攻击者无法区分"该邮箱没注册" vs "密码不对"。

⚠️ 顺便：响应里**不要**说"密码错误还是用户不存在"；但 error **日志里**要分清（运维排查用的）。

---

## service 之间的依赖

`AuthService` 构造里只注入了 `UsersService`：

```ts
constructor(private usersService: UsersService) {}
```

`AuthService` 不需要任何 HTTP / session 信息——它只拿 email + password，吐 user 实体。**写 session 是 controller 的事**：

```ts
// users.controller.ts
const user = await this.authService.signup(body.email, body.password);
session.userId = user.id;
```

这种分工很清晰：Auth 只懂"用户是谁、密码对不对"，controller 懂"如何让浏览器记住这次登录"。

---

## 总结

- 这是个"算法服务"：`signup` 写 salt + hash 入库；`signin` 用同样算法校验。
- 用 `scrypt`，比 MD5 / SHA-1 安全得多，但比 bcrypt 更新的实现。
- 教学上的两个简化：
  1. `salt` 与 `hash` 同列；
  2. 字符串比较**没有**用 timing-safe 比较。
- 错误返回目前**没有**合并"邮箱不存在 / 密码错"——教学项目里可以接受；生产要合并。
