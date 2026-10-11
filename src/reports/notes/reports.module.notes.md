# `reports.module.ts` 解读

> 配套文件：`src/reports/reports.module.ts`

## 文件原文

```ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { Report } from './report.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Report])],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
```

`ReportsModule` 是项目里第二个业务子模块，对应"reports" 业务。和 `UsersModule` 同形：同样的 `imports / controllers / providers` 三段式结构。

---

## `imports: [TypeOrmModule.forFeature([Report])]`

向 Nest 注册"我需要 `Report` 实体对应的 Repository"，这样 `ReportsService` 构造里能注入 `@InjectRepository(Report)`。

⚠️ 根模块 `AppModule` 那个 `TypeOrmModule.forRoot({ entities: [User, Report] })` 已经声明了 `Report` 在数据库里。这个 `forFeature([Report])` **不**再注册实体，只**造**一个能注入到 service 的 token。

---

## `controllers: [ReportsController]`

注册路由。`ReportsController` 当前只有一个空骨架（`@Controller('reports')` 没有任何 `@Get/@Post/...`），所以**不会有任何接口**。意味着：

```bash
curl localhost:3000/reports        # → 404
```

⚠️ 这是项目当前现状，不是 bug——是 tutorial 没做完。

---

## `providers: [ReportsService]`

service 在这个模块里可注入。`ReportsService` 构造里只依赖 `Repository<Report>`，所以 module 这边**不需要**再 nest 别的。

---

## 模块互不感知

`ReportsModule` 和 `UsersModule` **互不 import**。这是合理的——

- `Report` 在 entity 上与 `User` 没有外键（看 `report.entity.ts` 只有 `id` 和 `price`）；
- 业务上"report（价格快照 / 报告）"和"user"是独立领域。

如果以后 `Report` 改成"销售员提交的报单"、必须知道 `userId`，那时**一种**做法是：

```ts
// 在 Report entity 上加：
@ManyToOne(() => User) user: User;

// 在 ReportsService 的 method 接受 userId
// 但 ReportsService 不能直接注入 UsersService 来查
// 只能是 controller 拿到 user，自己查好 user 实体，传给 service
```

或者——**更好做法**：

```ts
// Report entity 加
@ManyToOne(() => User, (u) => u.reports) user: User;
// User entity 加镜像
@OneToMany(() => Report, (r) => r.user) reports: Report[];
// ReportsController 注入 UsersService 查 user
// ReportsService.create({ userId, price }) 接受 userId
```

但**不要**把 `UsersModule` 加到 `ReportsModule.imports` 里。这造成循环：Users 也 import Reports 来拿 service 时就崩。

---

## 总结

- `ReportsModule` 是数据库相关模块的标准样板（`forFeature`）。
- `ReportsController` 当前是空骨架，没有业务接口。
- service 已就绪，写 `create(price)` 就能写库——但 controller 没接，所以现状下整个模块能编译、能跑、但**对外**什么都不做。
