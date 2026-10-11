# `dtos/create-user.dto.ts` 解读

> 配套文件：`src/users/dtos/create-user.dto.ts`

## 文件原文

```ts
import { IsString, IsEmail } from 'class-validator';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
```

这是注册接口的**入参形状 + 校验规则**。

---

## 引入

```ts
import { IsString, IsEmail } from 'class-validator';
```

`class-validator` 是一个第三方包（`package.json` 里 `pnpm add class-validator class-transformer`），它和 Nest 的 `ValidationPipe` 配套：用 **TS 装饰器** 在类字段上声明规则。

## 出处

教程里第 N 集提示需要：

```
pnpm add class-validator class-transformer
```

这俩包必须同时装：

- `class-validator` —— 解析装饰器；
- `class-transformer` —— 把对象转成类的实例（`plainToInstance`），**ValidationPipe 强依赖**。

---

## 这个 DTO 的角色

DTO = Data Transfer Object。它就是个**只用来定义边界**的类：

1. 告诉 `ValidationPipe`"允许哪些字段、字段有什么规则"；
2. 告诉 TS 编译器 `@Body() body: CreateUserDto` 是什么样；
3. 通常它**不**包含逻辑，只包含字段声明。

---

## 各字段的装饰器

### `@IsEmail()`

```ts
@IsEmail()
email: string;
```

声明 email 字段必须符合 email 格式。`class-validator` 内部用正则 + RFC 5322 简化判定。
- 校验失败时 `ValidationPipe` 自动抛 400 `BadRequestException`，响应体：

```json
{
  "statusCode": 400,
  "message": ["email must be an email"],
  "error": "Bad Request"
}
```

### `@IsString()`

```ts
@IsString()
password: string;
```

只要求是字符串。**没有**长度、没有强度——密码 `"a"` 也能通过。

⚠️ **生产里至少要补一条**：

```ts
import { IsString, MinLength } from 'class-validator';

@IsString()
@MinLength(8)
password: string;
```

或者更严：

```ts
import { Matches } from 'class-validator';

@IsString()
@MinLength(8)
@Matches(/[A-Z]/)             // 至少一个大写
@Matches(/[0-9]/)             // 至少一个数字
password: string;
```

教程里不做，是因为它聚焦于 Nest 流程。但**真实做用户系统**时这里要展开。

---

## 跟 `app.module.ts` 的 `whitelist` 关系

```ts
new ValidationPipe({ whitelist: true })
```

`CreateUserDto` 是 **白名单源头**：
- DTO 上没声明的字段会在 inbound 时被**剥掉**（不是"被拒绝"，是"被悄悄删除"）。
- 比如前端发 `{ email, password, isAdmin: true }`，`isAdmin` 字段会**消失**——不会进 controller handler。

如果你希望"多余字段直接拒绝"，把 main.ts 那一行改成：

```ts
new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })
```

`forbidNonWhitelisted: true` 让多出的字段变成 400 而不是被忽略。

---

## 为什么 password 不带 `@IsStrongPassword()`

`class-validator` 有 `IsStrongPassword()`，但推荐**自定义规则**或**在 service 层校验**——"强密码"这件事和具体业务有关：

```ts
@IsStrongPassword({ minLength: 12, minSymbols: 1, minNumbers: 1 })
```

这个装饰器是 OWNPASS 项目里较新的支持。教程里保持简单。

---

## `UpdateUserDto` 与 `CreateUserDto` 的差别

`UpdateUserDto`（看 `update-user.dto.notes.md`）所有字段都 `@IsOptional()`——PATCH 是部分更新。原理：

- `@IsOptional()` 让 `undefined` 通过校验；
- 其它仍然要符合各自格式。

`CreateUserDto` 全部**必填**——POST 是创建。

---

## 总结

- `CreateUserDto` 是注册接口的**入参形状 + 校验规则**。
- 装饰器来自 `class-validator`；Nest 不直接插手，使用全靠 `ValidationPipe`。
- `whitelist: true` 让 DTO 之外的字段消失，但是"无声"的——生产建议开 `forbidNonWhitelisted`。
- 教程版本**没有**真正的密码强度校验——这是简化。
