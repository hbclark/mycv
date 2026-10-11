# `app.module.ts` 解读

> 配套文件：`src/app.module.ts`

## 文件原文

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { User } from './users/user.entity.js';
import { Report } from './reports/report.entity.js';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'better-sqlite3',
      database: 'db.sqlite',
      entities: [User, Report],
      synchronize: true, // in development only
    }),
    UsersModule,
    ReportsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
```

这是 Nest 的**根模块**。Nest 用"模块树"组织代码，根模块只有一个，被 `main.ts` 里的 `NestFactory.create(AppModule)` 加载。

---

## 角色

`@Module()` 装饰器告诉 Nest：

- `imports` — 我要依赖哪些模块（含第三方模块 `TypeOrmModule`）
- `controllers` — 这些 HTTP 入口由我注册
- `providers` — 这些 service / repository 可以被本模块的 controller 注入

`exports`（这里没）— 我想让外部模块看到我的哪些 provider。本文件没用到。

---

## `imports` 详解

### 1. `TypeOrmModule.forRoot({ ... })`

这是 Nest 装 TypeORM 的方式。`forRoot` 只在根模块调用一次。

| 字段 | 意思 |
|---|---|
| `type: 'better-sqlite3'` | 数据库驱动选 SQLite（零配置，适合本地学习） |
| `database: 'db.sqlite'` | 数据库文件路径，相对当前 `cwd` |
| `entities: [User, Report]` | 要管理的实体类，TypeORM 会为每个生成一张表 |
| `synchronize: true` | **根据 entity 自动建表、迁移**——开发期方便 |

#### ⚠️ `synchronize: true` 这个开关

注释自己写了："in development only, do not use in production"。

- **开发**：你改了 entity 字段 → `synchronize` 自动建表 → 不用手写 SQL migration。
- **生产**：**会丢数据**。它会"drop 现有表，按新 entity 重建"。

生产必须改成 `migrations` 模式：

```ts
synchronize: false,
migrations: ['dist/migrations/*.js'],
migrationsRun: true,
```

### 2. `UsersModule`、`ReportsModule`

子模块，被合并到根模块的依赖图里。`main.ts` 的 `NestFactory.create(AppModule)` 会顺着 `imports` 把整棵模块树都加载、实例化。

---

## `controllers: [AppController]`

只挂了一个**根 controller**（默认就是 `GET /` 返回 hello）。业务接口其实全在子模块里——这不是 Nest 推荐把 controller "提升到根"，而是脚手架默认值，你可以在 `UsersModule` 的 `controllers` 数组里看到全部业务接口。

---

## `providers: [AppService]`

只有 `AppService`（`getHello()`）。同样，业务 service 都在子模块里。

---

## 整张图

```
NestFactory.create(AppModule)
        │
        ├── imports
        │     ├── TypeOrmModule.forRoot({...})     ← 整个 DB 连接
        │     ├── UsersModule
        │     │     ├── imports: TypeOrmModule.forFeature([User])  ← User 的 Repository
        │     │     ├── controllers: [UsersController]
        │     │     └── providers:  [UsersService, AuthService]
        │     └── ReportsModule
        │           ├── imports: TypeOrmModule.forFeature([Report])
        │           ├── controllers: [ReportsController]
        │           └── providers:  [ReportsService]
        │
        ├── controllers: [AppController]
        │
        └── providers: [AppService]
```

---

## 常见误区

1. **把 `forRoot` 写在子模块里**：会报"重复 connection"。`forRoot` 是全局单例的，必须只在根模块调用。
2. **以为 `entities` 数组在 `UsersModule` 里就够了**：其实根模块也得列出来。TypeORM 是按这一处注册建表的，子模块里的 `forFeature([User])` 只是**拿 Repository**。
3. **`synchronize: true` 上生产**：所有数据会被 drop 重建。
