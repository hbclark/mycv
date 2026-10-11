# `user.entity.ts` 解读

> 配套文件：`src/users/user.entity.ts`

## 文件原文

```ts
import {
  AfterInsert, AfterRemove, AfterUpdate,
  Column, Entity, PrimaryGeneratedColumn,
} from 'typeorm';

@Entity()
export class User {
  @PrimaryGeneratedColumn() id: number;
  @Column() email: string;

  @Column()
  password: string;

  @AfterInsert()
  logInsert() {
    console.log('Inserted user with id', this.id);
  }
  @AfterUpdate()
  logUpdate() {
    console.log('Updated user with id', this.id);
  }
  @AfterRemove()
  logRemove() {
    console.log('Removed user with id', this.id);
  }
}
```

这是一个 TypeORM 的**实体类**，对数据库里一张 `users` 表。

---

## 装饰器做什么

| 装饰器 | 作用 |
|---|---|
| `@Entity()` | 标记类为实体；没传名字时默认用**类名小写后跟 s**——`User` → 表名 `users` |
| `@PrimaryGeneratedColumn()` | 声明主键，**自增**（SQLite/Postgres 都正确；MySQL 下会变 `AUTO_INCREMENT`） |
| `@Column()` | 普通列；没声明类型时 TypeORM 推断：TS `string` → varchar, TS `number` → int, TS `Date` → datetime |

---

## 列定义详解

### `id`

```ts
@PrimaryGeneratedColumn() id: number;
```

- 主键、自增、整数。在 SQLite 里是 `INTEGER PRIMARY KEY`。
- `number` 类型只是为了 TS 友好；运行时 TypeORM 会负责转型。

### `email`

```ts
@Column() email: string;
```

⚠️ **`没加 unique: true`**——看清楚了：

```ts
@Column({ unique: true }) email: string;  // 应该这么写
```

当前 entity 是松的。`auth.service.ts:14` 在应用层查重，但**没有**数据库级 UNIQUE 兜底。这意味着：

- 应用层查重正常运转 → 多半没问题；
- 一旦并发，或应用层被绕过，**可以**插入重复 email。

教学项目里问题不大，但你跑过 `signup` 几遍、第二遍 `email` 仍是同一个就失败了——失败原因是**应用层抛错**而不是 DB 报错。

**建议改**：给 email 加 `{ unique: true }`，并加索引。TypeORM 会自动加 UNIQUE 约束。

### `password`

```ts
@Column() password: string;
```

存的是 `${salt}.${hash.toString('hex')}` 字符串（看 `auth.service.ts`）。最敏感的一列。

⚠️ **必须**确保这一列**永远不在 controller 返回路径上**——你的 `@Serialize(UserDto)` + DTO 上没 `@Expose('password')`，已经达成。

但 entity 这一层不一定是"裸 SQL 暴露"的唯一渠道。如果是：

- **任何**别的 service 拿到 user 实体（比如 `findOne(7)`），entity 里 password 还在；
- 如果**直接** `JSON.stringify(user)` 而不过 DTO，password 就出去了。

所以序列化纪律是 service / controller 的共同责任，不是 entity 自己的责任。

---

## 实体钩子

```ts
@AfterInsert()  logInsert()  { console.log('Inserted user with id', this.id); }
@AfterUpdate()  logUpdate()  { console.log('Updated user with id', this.id); }
@AfterRemove()  logRemove()  { console.log('Removed user with id', this.id); }
```

TypeORM 在数据库操作**完成之后**调用这些钩子。

- **`@AfterInsert`**：INSERT 写入之后调用一次。
- **`@AfterUpdate`**：UPDATE 提交之后调用一次。
- **`@AfterRemove`**：DELETE 提交之后调用一次。

⚠️ 注意这些是 **TypeORM 钩子**，**不是** Express 中间件 / Nest 装饰器。它们与你项目里的 `interceptor / guard / middleware / pipe` 是两套机制。

### 钩子里的 this 是什么

是**被持久化的实体实例**，`this.id` 已经填好了数据库返回的 id。

⚠️ 钩子里**不要**写**重操作**（HTTP 请求、复杂运算、长事务）——会阻塞请求、超时。

### 实际工程一般怎么用

这种 `console.log` 是**演示**用的。生产里通常替换成：

- 发送 domain event 给消息队列；
- 删除分布式缓存；
- 触发其他 service 的"副作用"。

但 entity 钩子**不是好的副作用触发位**（耦合太重），通常用 Nest 的 `eventEmitter` / `outbox` 模式替代。

---

## 一个常见的踩坑：`@AfterRemove` vs `repo.delete(id)`

| | 触发 `@AfterRemove`？ | 触发 `@BeforeRemove`？ |
|---|---|---|
| `repo.remove(entity)` | ✅ | ✅ |
| `repo.delete(criteria)` | ❌ | ❌ |

`remove(entity)` 走 ORM 层、感知实体；`delete(criteria)` 走 SQL 层、**不会**触发钩子。

`UsersService.remove(...)` 用的是 `this.repo.remove(user)`（见 `users.service.ts:36`），所以本项目里 `repo.remove` 触发钩子——对的。

---

## 关于 `synchronize: true`

`app.module.ts` 里：

```ts
TypeOrmModule.forRoot({
  ...
  synchronize: true,   // ⚠️ 仅开发！
})
```

意味着每次启动 app，如果 entity 改了，**TypeORM 会自动 `CREATE / ALTER` 表**——连之前的数据都可能被 drop。

比如你现在给 email 加 `{ unique: true }` 然后重启：

- `synchronize: true` → 自动 `ALTER TABLE` 加 UNIQUE 约束；
- 数据不会丢；
- 但生产就坏了。

生产改成 migrations（独立 SQL 脚本）。它会**单独**写到 `migrations` 目录里。

---

## 总结

- 这是一个**最简单**的 TypeORM 实体：3 列 + 3 钩子。
- 你看到**任何**列名 / 类型注解的修改，必须意识到：它会重新影响数据库结构（开发期 `synchronize`、生产期 migration）。
- `email` 没 `unique` 是 tutorial 的简化；生产必加。
- 钩子只用于简单副作用；不要把 entity 当 service 用。
