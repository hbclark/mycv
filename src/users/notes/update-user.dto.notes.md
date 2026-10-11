# `dtos/update-user.dto.ts` 解读

> 配套文件：`src/users/dtos/update-user.dto.ts`

## 文件原文

```ts
import { IsString, IsEmail, IsOptional } from 'class-validator';

export class UpdateUserDto {
  @IsEmail()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  password?: string;
}
```

这是 `PATCH /auth/:id` 这个接口的入参形状——**所有字段都可省略**。

---

## 为什么字段都可选

HTTP `PATCH` 在语义上是"局部更新"。Nest 在 controller 里：

```ts
@Patch('/:id')
updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
  return this.usersService.update(parseInt(id), body);
}
```

`users.service.ts:25 update`:

```ts
async update(id: number, attrs: Partial<User>) {
  const user = await this.findOne(id);
  if (!user) throw new NotFoundException('user not found');
  Object.assign(user, attrs);
  return this.repo.save(user);
}
```

`Object.assign(user, attrs)` 只覆盖**实际传入**的字段。所以"省略" = "不改"。

---

## 各字段

### `email?: string`

```ts
@IsEmail()
@IsOptional()
email?: string;
```

- `@IsOptional()` —— `undefined` / 不传字段 → 通过校验。
- `@IsEmail()` —— 一旦传了，必须是 email 格式。
- `email?: string` —— TS 语法上标记"可以 undefined"。

`@IsOptional()` 是 `class-validator` 的语法。它通常**修饰**在 `@IsXxx` 之上：

```ts
@IsOptional()
@IsString()
```

顺序无所谓；重要的是有了 `@IsOptional()` 后，其他规则只在**字段不为 undefined 时**才生效。

### `password?: string`

```ts
@IsString()
@IsOptional()
password?: string;
```

同上，string 类型且可选。

⚠️ 当真要做"修改密码"的接口时通常要更严：

- 旧密码校验（old vs storedHash）；
- 新密码强度（minLength、强密码规则）；
- 盐重新生成（更新时 salt 也得换，否则攻击者拿到旧 salt 还是能跑字典）。

教程里没有这是合理的——它聚焦流程；但**生产版本**要全部补上。

---

## 比 PATCH 语义更准的替代

如果你严格遵循 RESTful：

- 部分更新字段 → **PATCH**
- 整体替换     → **PUT**

本项目 `Patch` 写法 = 用 DTO 做"patch shape"。这是最直接的做法。

---

## `@Body()` 与 `Partial<User>` 的关系

`UsersService.update(... attrs: Partial<User>)` 类型上是 `Partial<User>`（user 实体的"任意字段的子集"）。但**控制器不直接传 User**：

```ts
updateUser(@Body() body: UpdateUserDto) {
  return this.usersService.update(id, body);   // body 是 UpdateUserDto 实例
}
```

也就是说：**DTO 是 controller↔service 边界的语言**，而 service 内部用实体的 `Partial<>` 类型。两者在结构上碰巧都是 `{ email?: string, password?: string }`，所以传得通——但**类型上不同**。这是分层的好处：service 看不见 DTO，DTO 看不见 entity。

---

## 总结

- `UpdateUserDto` = "PATCH 入参形状，全部字段可选"。
- 配合 service 的 `Object.assign` 实现"局部更新"。
- 教学上 DTO 里只有 `email` 和 `password` 两个字段；生产可能要 `name`、`phone`、`profile` 等。
- 一旦扩字段，每个字段都得分别加 `@IsOptional()`，否则一旦传值就被校验拒。
