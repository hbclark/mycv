# `users.controller.ts` 解读

> 配套文件：`src/users/users.controller.ts`

## 文件原文

```ts
import {
  Body, Controller, Delete, Get, Param, Patch, Post,
  Query, NotFoundException, Session, UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dtos/create-user.dto.js';
import { UpdateUserDto } from './dtos/update-user.dto.js';
import { UsersService } from './users.service.js';
import { Serialize } from '../interceptors/serialize.interceptor.js';
import { UserDto } from './dtos/user.dto.js';
import { AuthService } from './auth.service.js';

@Controller('auth')
@Serialize(UserDto)
export class UsersController {
  constructor(
    private usersService: UsersService,
    private authService: AuthService,
  ) {}

  @Get('/colors/:color')
  setColor(@Param('color') color: string, @Session() session: any) {
    session.color = color;
  }

  @Get('/colors')
  getColor(@Session() session: any) {
    return session.color;
  }

  @Get('/whoami')
  whoAmI(@Session() session: any) {
    if (!session.userId) {
      throw new UnauthorizedException('not signed in');
    }
    return this.usersService.findOne(session.userId);
  }

  @Post('signup')
  async createUser(@Body() body: CreateUserDto, @Session() session: any) {
    const user = await this.authService.signup(body.email, body.password);
    session.userId = user.id;
    return user;
  }

  @Post('signin')
  async signin(@Body() body: CreateUserDto, @Session() session: any) {
    const user = await this.authService.signin(body.email, body.password);
    session.userId = user.id;
    return user;
  }

  @Get('/:id')
  async findUser(@Param('id') id: string) {
    const user = await this.usersService.findOne(parseInt(id));
    if (!user) throw new NotFoundException('user not found');
    return user;
  }

  @Get()
  findAllUsers(@Query('email') email: string) {
    return this.usersService.find(email);
  }

  @Patch('/:id')
  updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.usersService.update(parseInt(id), body);
  }

  @Delete('/:id')
  removeUser(@Param('id') id: string) {
    return this.usersService.remove(parseInt(id));
  }
}
```

这是整个项目的**路由层**。用 `@Controller('auth')` 把所有路由挂到 `/auth` 下：

- `POST /auth/signup`、`POST /auth/signin`、`GET /auth/whoami`、`POST /auth/signout`（已注释过的）
- `GET /auth/colors/:color`、`GET /auth/colors`
- `GET /auth/:id`、`GET /auth`
- `PATCH /auth/:id`、`DELETE /auth/:id`

类级别的 `@Serialize(UserDto)` 让所有方法返回的对象都被拦截器过一遍 DTO——**`password` 字段在响应阶段被剥掉**。

---

## 各路由逐个讲

### 1. `signup` 与 `signin` —— 会话生命周期

```ts
@Post('signup')
async createUser(@Body() body: CreateUserDto, @Session() session: any) {
  const user = await this.authService.signup(body.email, body.password);
  session.userId = user.id;
  return user;
}
```

- `@Body() body: CreateUserDto` —— 由 `ValidationPipe({ whitelist: true })` 校验并去掉多余字段。
- `await this.authService.signup(...)` —— 内部走 `users.service.ts:create()`，实际把 hash 后的 password 写进 DB，返回 user 实体。
- `session.userId = user.id` —— **写入** session（`cookie-session` 中间件会把它加密到下次响应的 cookie 里）。
- `return user` —— 返回 entity；由于 class-level `@Serialize(UserDto)`，响应时只有 `{id, email}` 出来。

⚠️ **注意耦合点**：鉴权和写 session 都在 controller 层，而不是 AuthGuard 或 Interceptor。这是学习项目里清晰的写法，生产通常会把"session 写入"挪到一个 Interceptor 内部。

### 2. `whoami` —— 登录态查询

```ts
@Get('/whoami')
whoAmI(@Session() session: any) {
  if (!session.userId) {
    throw new UnauthorizedException('not signed in');
  }
  return this.usersService.findOne(session.userId);
}
```

- `if (!session.userId)` —— 没登录就抛 401。
- `findOne(session.userId)` —— 这里类型上是 `userId: any`，但是 service 签名要 `number`。TypeORM `findOne({ where: { id: any } })` 较宽容，**实际上**会拿到 `undefined`（无匹配行），然后 `SerializeInterceptor` 还是把它过滤一次——但你最好显式做个类型断言或转换：

```ts
return this.usersService.findOne(parseInt(session.userId));
```

⚠️ **404 vs 401 不要混**：未登录 → 401；已登录但不存在 → 404。

### 3. `colors` 这一对——只是占位学习用

```ts
@Get('/colors/:color')
setColor(@Param('color') color: string, @Session() session: any) {
  session.color = color;
});
```

```ts
@Get('/colors')
getColor(@Session() session: any) {
  return session.color;
}
```

整个项目里**唯一**两个 GET 接口会**写**服务端状态：把 `session.color` 设进 cookie 里。这是 Stephen Grider 教程里的"过度简化案例"，用来展示 session 的读和写。

⚠️ 设计上有点别扭（GET 写状态违反了 safe method 的定义）。如果你以后想做严格项目，把它们改成 `POST /colors` + `GET /colors`。但教程代码可以保留。

### 4. `findUser(:id)` 与 `find(email)` —— 普通查询

```ts
@Get('/:id')
async findUser(@Param('id') id: string) {
  const user = await this.usersService.findOne(parseInt(id));
  if (!user) throw new NotFoundException('user not found');
  return user;
}

@Get()
findAllUsers(@Query('email') email: string) {
  return this.usersService.find(email);
}
```

- `parseInt(id)` —— route 里的 `:id` 是 `string`，DB 里的 id 是 `number`，所以转一下。
- `findAllUsers` 没有 `@Query('email')` 校验；改成 DTO 校验更好（虽然这接口是学习用）。
- 两条路由都没有鉴权——它们可以**匿名**访问。生产要给这类数据加权限控制。

### 5. `update` 与 `remove` —— 修改型操作

```ts
@Patch('/:id')
updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
  return this.usersService.update(parseInt(id), body);
}

@Delete('/:id')
removeUser(@Param('id') id: string) {
  return this.usersService.remove(parseInt(id));
}
```

- PATCH 用 `UpdateUserDto`（**所有字段都 `IsOptional`**）。
- DELETE 不需要 body。
- 都没鉴权——生产必须加 Guard："只能改自己的账号"或"管理员才能删"。

---

## 参数装饰器小结

| 装饰器 | 来源 | 取自哪里 |
|---|---|---|
| `@Body()` | HTTP 包体 | 已通过 `ValidationPipe` + DTO 校验 |
| `@Param('id')` | URL 段 | `:id` 这种占位 |
| `@Query('email')` | 查询字符串 | `?email=...` |
| `@Session()` | `cookie-session` 中间件注入 | `req.session` 这个对象 |

`@CurrentUser()` 也是类似装饰器，但目前没接线（见 `current-user.decorator.notes.md`）。

---

## controller 与 service 的边界

你注意 controller 里**没有**任何业务规则——所有判断都在 service 里。

- controller：**只**做"接 HTTP、入参校验、调 service、写 session、return 结果"。
- service：纯业务（hash 密码、写 DB、find）。

这是 Nest 的核心约定，违背它就会出现"controller 里写了 SQL / 写 hash 算法"这种代码——那种 controller 不可测、不可复用。

---

## 总结

- 这是带"鉴权能力"的用户 controller：`signup / signin / whoami / signout` 在一起，加 `colors` 测试桩和 CRUD。
- 整个文件的入口逻辑不超过 80 行——这就是 controller 的定位。
- `@Serialize(UserDto)`（class 级）+ DTO 里的 `@Expose` + `excludeExtraneousValues` 配合，保证 `password` 字段永不外流。
- 真正的鉴权层（Guard）目前**没**写，所以 `whoami` 用 `if (!session.userId)` 手写 401，这是个**过渡**，不是工业级实现。
