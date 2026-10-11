# `reports.service.ts` 解读

> 配套文件：`src/reports/reports.service.ts`

## 文件原文

```ts
import { Injectable } from '@nestjs/common';
import { Report } from './report.entity.js';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private repo: Repository<Report>,
  ) {}

  create(email: string, price: number) {
    const report = this.repo.create({ price });
    return this.repo.save(report);
  }
}
```

这是 `reports` 模块的**业务层**，只有 `create` 一个方法。

---

## 注入 Repository

与 `UsersService` 同形：`@InjectRepository(Report) private repo: Repository<Report>`，从 `ReportsModule` 的 `TypeOrmModule.forFeature([Report])` 获取。

---

## `create`

```ts
create(email: string, price: number) {
  const report = this.repo.create({ price });
  return this.repo.save(report);
}
```

⚠️ 这个方法有个**显眼**的问题——

```ts
create(email: string, price: number)
```

函数**有** `email` 参数，但**没用**它。

```ts
const report = this.repo.create({ price });
```

`plainToInstance(Report, { price })` —— 只放了 `price`。`email` 被无视。

这看上去是 tutorial 阶段留下的占位代码：

1. 当时可能打算"按 email 标记报告"；
2. 后来没填进去；
3. 也没引入 `Report.user` 关系；
4. 现在它是**死参数**。

---

## 当前服务能做什么

| 方法 | 入参 | 行为 |
|---|---|---|
| `create(email, price)` | 任意 email + 数值 | 在 `reports` 表里写一行，但 email **被丢弃** |
| 其它 | —— | 没有 |

`Report` 表目前两列：`id` 和 `price`。`email` 不会被记录。

⚠️ 实际上 controller **也没**暴露这条路径（看 `reports.controller.notes.md`）。所以**整个 service 无人调用**——能跑，但 unreachable。

---

## 想"完善"这个 service 的方向

### 方案 1：去掉 email 形参

最直接的简化：

```ts
create(price: number) {
  const report = this.repo.create({ price });
  return this.repo.save(report);
}
```

不写就不传，类型真实。教程里 `email` 是个 bug 上身。

### 方案 2：让 email 真正起作用

给 `Report` 加外键关联 `User`：

```ts
// report.entity.ts
@ManyToOne(() => User, (u) => u.reports, { eager: true })
user: User;
```

```ts
// reports.service.ts
create(price: number, user: User) {
  const report = this.repo.create({ price, user });
  return this.repo.save(report);
}
```

`user` 在 insert 的时候一起写入。然后用 `@CurrentUser()` 拿到当前用户，service 拿到 user 实体。**email 参数就可以彻底丢掉了**，因为 user 实体里就有。

---

## 总结

- 这个 service 几乎只做了"建一个价格报告"这件事，把 `email` 参数**忽略**。
- 实体层 `Report` 还很轻：只有 `id` 和 `price`。
- controller **没**接入，所以这个 service 实际上 unreachable。
- tutorial 的简化痕迹：如果以后想拓展，"加外键关联 user" 是合理的下一站。
