# `dtos/user.dto.ts` 解读

> 配套文件：`src/users/dtos/user.dto.ts`

## 文件原文

```ts
import { Expose } from 'class-transformer';

export class UserDto {
  @Expose()
  id: number;

  @Expose()
  email: string;
}
```

这是 controller **响应** 时用的形状 + 白名单：`password` **不能** 进入响应体。

---

## 装饰器 `@Expose`

`@Expose()` 是 `class-transformer` 这个包的注解。它的语义是"这个字段**参与**白名单过滤"。配合 `plainToClass(UserDto, entity, { excludeExtraneousValues: true })` 一起用：

- 没标 `@Expose` 的字段 → **被剥掉**；
- 标了 `@Expose` 的字段 → **保留**；
- `excludeExtraneousValues: true` 必须显式传入才生效。

`excludeExtraneousValues` 字面意思："排除外来的值"。这里"外来"=DTO 上没列的字段。

---

## 怎么被使用

`users.controller.ts` 顶层：

```ts
@Controller('auth')
@Serialize(UserDto)
export class UsersController { ... }
```

`@Serialize(UserDto)` 是上面 `serialize.interceptor.ts` 暴露出来的**装饰器工厂**。它把 `SerializeInterceptor` 预先装好 `UserDto` 挂上去，让 controller 任何方法返回的对象都被过一遍 DTO。

具体流程：

```
User entity { id, email, password }
                       ↓
plainToClass(UserDto, user, { excludeExtraneousValues: true })
                       ↓
UserDto { id, email }      ←  password 被剥掉
                       ↓
JSON response: { "id": 7, "email": "..." }
```

---

## 跟 entity 的对比

| 维度 | entity (`User`) | DTO (`UserDto`) |
|---|---|---|
| 字段含义 | 描述 DB 表 | 描述 API 边界 |
| 包含 password | 是（hash 过的） | **不** |
| 注解来源 | TypeORM | class-transformer |
| 谁用 | Service 内部 | Controller / SerializeInterceptor |

`password` 这一字段在 entity 里是**必须**有的（要 hash 比较）；在 DTO 里是**不能**有的（不能泄露）。**分离**才是对的——不要在 entity 上加 `@Expose` 试图同时做两件事。

---

## `@Expose()` vs `@Exclude()` 反过来用

`class-transformer` 也有反向用法：

```ts
import { Exclude } from 'class-transformer';

class UserDto {
  id: number;
  email: string;

  @Exclude()
  password: string;     // 显式排除
}
```

两种风格都可以。`@Expose` 更显式、更适合白名单策略（一个新加的字段默认不暴露，需要显式标 `@Expose`，避免漏）；`@Exclude` 在字段少时更紧凑。

---

## 未来 DTO 增长的方向

通常随业务发展会拆出**多个** DTO 而非一个：

```ts
@Expose() id: number;
@Expose() email: string;
@Expose() createdAt: Date;
@Expose() role: 'user' | 'admin';
```

```ts
UserAdminDto      // 给管理员看：包含 createdAt、lastLoginAt
UserPublicDto     // 公开看：只 id, email
UserSelfDto       // 用户本人看：id, email, createdAt, balance
```

每个 DTO 一个白名单。

---

## 特别注意：`@Serialize(UserDto)` 是类级别

`users.controller.ts` 顶部有：

```ts
@Controller('auth')
@Serialize(UserDto)
export class UsersController { ... }
```

意味着 controller 里**所有方法**返回的对象都会过 `UserDto` 白名单。

⚠️ 风险点：如果有个接口故意要返回**完整** User（比如管理员调试接口）就**不会**工作。

解决办法——方法级覆盖：

```ts
@Get('/admin/:id')
@Serialize(AdminUserDto)             // 方法级 @Serialize 覆盖类级
findUserAsAdmin(...) { ... }
```

或方法级关闭：

```ts
@Get('/admin/raw/:id')
@Serialize(undefined)
findUserRaw(...) { ... }             // 现在的框架支持 undefined
```

教程版本不需要这种覆盖；写出来只是让你心里有数。

---

## 总结

- `UserDto` = 响应白名单，**只**有 `id` 和 `email`。
- `@Expose()` 是字段级白名单标记，必须配 `excludeExtraneousValues: true` 才生效。
- 与 entity 分离：entity 描述 DB 表，DTO 描述 API 边界。**敏感字段在 DTO 中不存在**。
