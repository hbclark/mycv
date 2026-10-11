# `users.module.ts` 解读

> 配套文件：`src/users/users.module.ts`

## 文件原文

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { User } from './user.entity.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [UsersService, AuthService],
  controllers: [UsersController],
})
export class UsersModule {}
```

这是 Nest 的**子模块**，专门管理"用户"相关的代码。在 `AppModule` 的 `imports` 数组里被引用：

```ts
// app.module.ts
imports: [TypeOrmModule.forRoot({...}), UsersModule, ReportsModule],
```

---

## 各行分别做什么

```ts
imports: [TypeOrmModule.forFeature([User])]
```

`forFeature` 是接 `forRoot` 的：根模块的 `forRoot` 建好数据库连接，子模块的 `forFeature([User])` 是说"我要拿 `User` 的 Repository"。这是 Nest 的 **DI 注入** `User` 仓库的来源——`UsersService` 构造里 `@InjectRepository(User) private repo: Repository<User>` 拿到的就是这个。

```ts
controllers: [UsersController]
```

注册 controller。Nest 扫这个数组来 mount 路由——`users.controller.ts` 里所有 `@Get/@Post/@Patch/@Delete` 都会被注册。

```ts
providers: [UsersService, AuthService]
```

本模块里可以被注入的两个 service 类。`AuthService` 也属于这里，因为它的"业务范围"也是用户（注册 / 登录）。从依赖角度这也是合理的：`AuthService` 构造里 `private usersService: UsersService`——`AuthService` 只依赖 `UsersService`，都属于 `UsersModule`。

---

## 模块之间的边界

`UsersModule` 现在没 `exports`。意思是 `ReportsModule` 想用 `UsersService` 还**用不了**——它不知道这个 service 的存在。后续如果要给 `Report` 关联 `User` 让 `ReportsService` 查 user，就要：

```ts
@Module({
  ...
  exports: [UsersService],     // 显式开口
})
export class UsersModule {}
```

或者更好，**只对外暴露一个 `User` 的 Repository**（不再跨模块 service 调用）。跨模块的"用户操作"集中在 `UsersService` 里是一种干净的分层。

---

## 整个 Nest 应用启动时这个文件被加载的顺序

1. main.ts `NestFactory.create(AppModule)` → 扫 `AppModule.imports`
2. 看到 `UsersModule` ——加载它
3. 看到 `imports: [TypeOrmModule.forFeature([User])]` ——向已经准备好的 DB 连接要一个 `User` 的 Repository provider，注册到 `UsersModule`
4. 实例化 `UsersService` 和 `AuthService`（注意：按依赖顺序，`AuthService` 依赖 `UsersService`，所以 `UsersService` 先实例）
5. 注册 `UsersController`，它的 constructor 注入 `UsersService` 和 `AuthService`

整个过程是**递归的、深度优先的**，按依赖图遍历，每个 provider 只实例一次。

---

## 模块拆分原则速查

- **一个子模块承载一组业务能力**（用户、报告、订单…）
- 子模块里 `imports` 子模块的 `forFeature`、`exports` 给上游
- 多大的代码量拆一个模块，没有硬标准——一般是"100~500 行业务代码 + 5~10 个 controller / service"

---

## 总结

- `UsersModule` 是用户功能的"容器"
- `TypeOrmModule.forFeature([User])` 是与数据库相关的"管道开关"
- `controllers/providers` 是向 Nest 注册"哪些 class 该参与 IoC"的清单
- 这个模块的能力 **不能** 被外部模块使用，因为没 `exports`
