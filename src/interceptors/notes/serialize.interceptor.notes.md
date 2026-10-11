# `serialize.interceptor.ts` 解读

> 配套文件：`src/interceptors/serialize.interceptor.ts`

## 文件原文

```ts
import {
  UseInterceptors,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { plainToClass } from 'class-transformer';

interface ClassConstructor {
  new (...args: any[]): {};
}

export function Serialize(dto: ClassConstructor) {
  return UseInterceptors(new SerializeInterceptor(dto));
}

export class SerializeInterceptor implements NestInterceptor {
  constructor(private dto: ClassConstructor) {}

  intercept(context: ExecutionContext, handler: CallHandler): Observable<any> {
    return handler.handle().pipe(
      map((data: any) => {
        return plainToClass(this.dto, data, { excludeExtraneousValues: true });
      }),
    );
  }
}
```

这个文件做了**两件事**：

1. **声明一个 `SerializeInterceptor` 类**（Nest 要求的"拦截器形状"）
2. **声明一个 `Serialize(dto)` 装饰器工厂**，用来把上面那个拦截器**预先注入 dto**挂到 controller 或方法上

目的：用 DTO **过滤掉敏感字段**——例如把 user entity 的 `password` 字段在响应出去之前剥掉。

---

## 为什么需要这个拦截器

`User` entity 包含 `password` 列，你**不能**直接让 controller `return user` 把 entity 全交出去，否则 `password` 就跟着 JSON 走了。

解决方案：**DTO（Data Transfer Object）**——一个只声明"允许暴露"字段的类：

```ts
// users/dtos/user.dto.ts
export class UserDto {
  @Expose() id: number;
  @Expose() email: string;
}
```

然后**在出口把 User 转成 UserDto**——这就是拦截器做的事。

---

## `interface ClassConstructor`

```ts
interface ClassConstructor {
  new (...args: any[]): {};
}
```

这是 TypeScript 里"描述"一个**类的形状**的小技巧。`new (...args: any[]): {}` 是构造函数签名——意思是"任何可以用 `new` 调用的构造函数"。使用方传 `UserDto` 这种类即可。

⚠️ 注意：你也可以用更现代的写法 `abstract new (...args: any) => object` 或 TS 4.5+ 的 `abstract new (...args: any) => {}`。本文件写法等价，不必改。

---

## `Serialize(dto)` —— 装饰器工厂

```ts
export function Serialize(dto: ClassConstructor) {
  return UseInterceptors(new SerializeInterceptor(dto));
}
```

用法：

```ts
@Controller('auth')
@Serialize(UserDto)
export class UsersController { ... }
```

或者方法级：

```ts
@Get('/:id')
@Serialize(UserDto)
findUser(...) { ... }
```

#### 关键点：**直接 `new SerializeInterceptor(dto)`**

它**不**走 Nest DI，而是手 `new`。源码里那段中文注释说得清楚：

> "new, 所以 NestJs 的DI不会参与SerializeInterceptor的实例化。如果SerializeInterceptor的构造函数需要注入其他Service, 就会失败，变成 undefined。"

这是个**故意的权衡**：

- `SerializeInterceptor` 没有外部依赖（只是一个 DTO 名字）；
- 不走 DI 更简单、能为方法装饰器用（方法级 `@UseInterceptors` 也可以传实例，但工厂形态更顺）。

---

## `SerializeInterceptor implements NestInterceptor`

```ts
export class SerializeInterceptor implements NestInterceptor {
  constructor(private dto: ClassConstructor) {}

  intercept(context: ExecutionContext, handler: CallHandler): Observable<any> {
    return handler.handle().pipe(
      map((data: any) => {
        return plainToClass(this.dto, data, { excludeExtraneousValues: true });
      }),
    );
  }
}
```

`NestInterceptor` 接口**强制**你写一个 `intercept` 方法：

- 第一个参数 `context` —— 与 Guard、过滤器一样，可以用 `switchToHttp().getRequest()` 拿 req。**本拦截器没用 req**。
- 第二个参数 `handler` —— 控制器方法 chain 的**下一棒**，`handler.handle()` 返回一个 `Observable<any>` 类型的流，**`Observable` 完成时 = controller 方法返回了**。

### 整体流程

```
请求进入
   ↓
@Serialize(UserDto) 在 controller 上挂上 SerializeInterceptor
   ↓
intercept(...)
   ├─ handler.handle()  // 触发 controller.getHello() 之类的真实方法
   ├─ .pipe(...)         // 在它们返回后再 map 一下
   └─ map(data => plainToClass(UserDto, data, { excludeExtraneousValues: true }))
       ↓
客户端看到的只有 UserDto 上 @Expose 过的字段
```

### `plainToClass(SerializeInterceptor.dto, data, { excludeExtraneousValues: true })`

`class-transformer` 提供的工具——把普通对象（带 password 的 User 实体）变成 UserDto 实例：

- `this.dto` —— 目标类（这里是 `UserDto`）
- `data` —— 源对象（实体或任何对象）
- `excludeExtraneousValues: true` —— **未声明**的字段全部抛掉

`@Expose()` 是 class-transformer 的注解，标注"哪些字段要保留"——没标的就丢。

```ts
export class UserDto {
  @Expose() id: number;
  @Expose() email: string;
}
```

`password` 没标 `@Expose()`，所以丢。

⚠️ **必须** `excludeExtraneousValues: true`，否则 `plainToClass` 不过滤。

⚠️ 如果你用 `class-transformer` 较新版本，函数叫 `plainToInstance`：`plainToInstance(this.dto, data, { excludeExtraneousValues: true })`。**老名字 `plainToClass` 还在但已 deprecated**——之后升级时记得改。

---

## `Observable` 为什么是 rxjs

Nest 的 handler chain 内部用 RxJS pipe 串起来。这样能 `map`、`filter`、`mergeMap`、`timeout` 等。如果你不想写响应式，就把它当作**只能用 `.pipe(map(...))` 的固定形状**：

```ts
return next.handle().pipe(
  map((data) => transformData(data)),     // 一个 map 就够
);
```

---

## 一个新手常见疑问：能直接 return entity 然后让 `class-transformer` 全自动？

不能，因为：

1. `excludeExtraneousValues` 需要 DTO 显式标注每个字段；
2. `@Expose()` 也得写在 DTO 上；
3. 拦截器必须**显式调用 `plainToClass`**——Nest 自己不会自动转。

所以就形成了"DTO 不在 controller 里自己用，而是被拦截器主动使用"的模式。

---

## 在你项目里的实际使用

`users.controller.ts` 顶层有：

```ts
@Controller('auth')
@Serialize(UserDto)
export class UsersController { ... }
```

这会让 controller 里**任何方法返回**的对象（`User` 实体 / 数组）都被拦截器过一遍 DTO，**`password` 字段被剥掉**。

如果将来有一个方法不想剥（比如管理员接口全字段返回），可以在方法级覆盖：

```ts
@Get('/admin/:id')
@Serialize(AdminUserFullDto)            // 不带 @Expose 限制的 DTO
findUserAsAdmin(...) { ... }
```

---

## 总结

- 这个文件是**响应体塑形器**："user entity → UserDto"在出口处强制执行。
- `Serialize(dto)` 装饰器把拦截器**预先装好 dto**挂上去，写法更简洁。
- 不走 DI 是故意的——因为这个拦截器**只**需要一个 dto 类，没有任何外部依赖。
- 隐藏陷阱：用 `plainToClass` 记得 `excludeExtraneousValues: true`，否则等于不生效。
