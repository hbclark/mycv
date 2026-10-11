# `report.entity.ts` 解读

> 配套文件：`src/reports/report.entity.ts`

## 文件原文

```ts
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';

@Entity()
export class Report {
  @PrimaryGeneratedColumn()
  id: number;
  @Column()
  price: number;
}
```

这是一个最简版 TypeORM 实体：只有两列。

---

## 各装饰器

| 装饰器 | 在这里做什么 |
|---|---|
| `@Entity()` | 类是实体。表名默认按类名 → `Report` → 表名 `reports`（小写 + 复数约定的 TypeORM 默认） |
| `@PrimaryGeneratedColumn()` | 主键，自增，整数 |
| `@Column()` | `price` 列，TS 上是 `number`，TypeORM 推断为 int（或根据列宽自动匹配 SQLite 的 affinity） |

⚠️ 注意：教程里这一列**没有**@AfterInsert / @AfterUpdate 等钩子——和 `User` entity 不同。这是个**更小**的实体。

---

## 表结构

当你启动服务（`synchronize: true`），TypeORM 会建：

```
reports
+----+--------+
| id | price  |
+----+--------+
| INTEGER  | INTEGER |
| PK       |          |
| AUTO_INC |          |
+----+--------+
```

数值列的"精度"没声明，**默认**对数字是 `number` → SQLite 中是 `REAL`（浮点）。如果你业务上要严格整数，可在 `@Column` 里显式指定：

```ts
@Column('int')
price: number;

@Column('decimal', { precision: 10, scale: 2 })    // 钱：10 位 + 2 位小数
price: number;
```

教程版本没做精度约束，这是简化。

---

## 这就是它全部的列

```ts
id: number;
price: number;
```

意味着这张表**只**记录价格，**不**记录其它信息：

- 没有 user id（谁创建的？）
- 没有 created_at（什么时候？）
- 没有商品、订单……

如果未来要"价格报告"业务，必须补字段。**最常见的扩展**：

```ts
@Entity()
export class Report {
  @PrimaryGeneratedColumn() id: number;
  @Column('decimal', { precision: 12, scale: 2 }) price: number;
  
  @ManyToOne(() => User, (u) => u.reports, { eager: true })   // 关联
  user: User;
  
  @Column() approved: boolean;        // 审核状态
  @CreateDateColumn() createdAt: Date;  // 创建时间
  @UpdateDateColumn() updatedAt: Date;  // 更新时间
}
```

`@CreateDateColumn` / `@UpdateDateColumn` 来自 TypeORM 自动维护的特性：插入/更新时自动写时间戳。

---

## `@ManyToOne` 关联的细节（没加，但提一下）

如果把 `Report.user` 设置成 `@ManyToOne(() => User)`，那么：

- 一条 Report 对应一个 User；
- 一条 User 可以对应多条 Report（看 User 那边加 `@OneToMany` 做镜像）。

`{ eager: true }` 让 find 查询自动 join user——不必手动 `relations: ['user']`。方便读取，但**写多更新查询时反而不必要地加载 user**。

⚠️ 教学项目不必急着加；等业务有需要再补。

---

## service 用这个 entity

```ts
// reports.service.ts
const report = this.repo.create({ price });   // 传入 { price }，对应上面的 @Column('price')
return this.repo.save(report);
```

也就是说当前**任何**调用 `reportsService.create(...)` 都会写一行只有 `price` 的记录。其他列（`id` 自增不需要传；`user` 不存在）——除了 price，啥也没记。

`reports.service.create(email, price)` 的 `email` 参数因为没有对应列，被忽略掉了。这是看 service 时的一个细节。

---

## 总结

- 这是一个 2 列 entity，最简单直观。
- 类型注解只声明了字段**类型**（`number`），**没**声明数据库 schema 细节。
- 教程里的"扩展空间"非常大：钱应当用 decimal 而不是 integer；外键关联 user；时间戳列；状态字段。
- 这不是 bug，是 tutorial 半成品的合理状态。
