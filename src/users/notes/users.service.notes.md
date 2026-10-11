# `users.service.ts` 解读

> 配套文件：`src/users/users.service.ts`

## 文件原文

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private repo: Repository<User>,
  ) {}

  create(email: string, password: string) {
    const user = this.repo.create({ email, password });
    return this.repo.save(user);
  }

  findOne(id: number) {
    return this.repo.findOneBy({ id });
  }

  find(email: string) {
    return this.repo.find({ where: { email: email.trim() } });
  }

  async update(id: number, attrs: Partial<User>) {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException('user not found');
    Object.assign(user, attrs);
    return this.repo.save(user);
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException('user not found');
    return this.repo.remove(user);
  }
}
```

这是"用户"模块的**业务层**：纯 DB 增删改查，**不**知道 HTTP。

---

## 注入 Repository

```ts
@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private repo: Repository<User>,
  ) {}
}
```

- `@InjectRepository(User)` —— 告诉 Nest"按 `User` 类注入"。
- 注入值的来源是 `UsersModule` 的 `TypeOrmModule.forFeature([User])`——它向 Nest 注册了一个 token，对应 `User` 的 Repository。
- 类型 `Repository<User>` 不是装饰器提供的，而是 TypeScript 的类型标注。**运行时**所有反射都靠 token（`'UserRepository'` 这种）。

### 为什么这里要"再注入一层"，不能直接 `new Repository(...)`

- `new Repository(...)` 不会拿到连接池。
- 不同的请求可能用不同的连接；Nest 容器会替你管理这一点。
- 与单元测试配合时，**只要** mock 注入，`service` 体内完全不需要改。

---

## 各方法

### `create`

```ts
create(email: string, password: string) {
  const user = this.repo.create({ email, password });
  return this.repo.save(user);
}
```

- `repo.create({...})` —— **构造一个实体实例但不写 DB**。这是个"内存里的对象"。
- `repo.save(user)` —— 写入并返回（带 id 等数据库生成字段）。

⚠️ 两个步骤看起来像冗余，但分开有原因：`create` 让你能在写入前调各种钩子（`@BeforeInsert` 等），或者只是检查对象本身有没有问题。`save` 也支持"已存在的 update，未存在的 insert"——upsert 语义。

### `findOne`

```ts
findOne(id: number) {
  return this.repo.findOneBy({ id });
}
```

`findOneBy({ where })` 是 TypeORM 推荐的写法（替代 `findOne({ where: {...} })`，后者已 deprecated）。

返回 `Promise<User | null>`。**注意 `null`**——controller 里要处理这个。

### `find`

```ts
find(email: string) {
  return this.repo.find({ where: { email: email.trim() } });
}
```

- `repo.find()` 返回 `Promise<User[]>`。
- `email.trim()` 防前端手抖打空格。
- 没用 `findOneBy`，因为允许返回多个（业务上的"查重"）。

如果 email 上有 unique 索引（看 entity），那么实际上**永远不会**返回多个；但 TypeORM 不知道数据库约束，所以这里用 `find` 是对的——类型上承担"多结果"可能。

### `update`

```ts
async update(id: number, attrs: Partial<User>) {
  const user = await this.findOne(id);
  if (!user) throw new NotFoundException('user not found');
  Object.assign(user, attrs);
  return this.repo.save(user);
}
```

- `Partial<User>` —— 类型上允许**只更新部分字段**。
- `findOne` 找不到时抛 404。
- `Object.assign(user, attrs)` —— 局部覆盖字段。⚠️ 这等于"信任 attrs 是被校验过的"——也就是说 `@Body() body: UpdateUserDto` 必须经过 `ValidationPipe` 处理，否则前端塞 `isAdmin: true` 会成为真"管理员"。

`Partial<User>` 是个**类型层语义**：表达"函数的入参只要 user 的部分字段"。它不会过滤运行时的字段——这是 DTO 在 controller 侧挡的事。

### `remove`

```ts
async remove(id: number) {
  const user = await this.findOne(id);
  if (!user) throw new NotFoundException('user not found');
  return this.repo.remove(user);
}
```

`repo.remove(user)` —— 删除。**必须**传实体，不能传 id。也可以用 `delete(id)` 直接接 id——但 `remove` 会触发 entity 上的 `@AfterRemove` 钩子；`delete` 是 SQL 层操作，**不会**触发。

目前 entity 里有 `@AfterRemove()`，所以这里用 `remove` 是对的。

---

## `NotFoundException` 是怎么被转成 HTTP 响应的

Nest 内置 `HttpExceptionFilter` 把 `NotFoundException` 转成：

```
HTTP/1.1 404 Not Found
{
  "statusCode": 404,
  "message": "user not found",
  "error": "Not Found"
}
```

这是为什么 controller 里直接 `throw new NotFoundException(...)` 就行——不用手写 `res.status(404)`。

---

## 一个常见误区：`create` 的字段顺序

```ts
create(email: string, password: string)
```

函数参数顺序并不"影响 SQL 顺序"——你**完全可以用对象**：

```ts
createUser(insertData: { email: string; password: string }): Promise<User>
```

对象传参更**可扩展**，将来加字段不必改调用方。本文件用位置参数是因为 Nest 教程里最简单。等业务复杂起来再迁。

---

## 总结

- 这个 service 是 TypeORM 的 Repository 之上一层**薄薄**的业务封装。
- 4 个核心 CRUD + `find(email)` 工具方法。
- 假设入参合法——controller 那层（`ValidationPipe` + DTO）负责保护。
- 不要在这里加任何 HTTP 知识（不引 `req`、不引 `res`），否则 service 不可测、不可在别的入口复用。
