# `app.controller.ts` 解读

> 配套文件：`src/app.controller.ts`

## 文件原文

```ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
```

Nest **脚手架的默认 controller**，通常是项目新建时自动生成的"健康检查"——`GET /` 返回 `"Hello World!"`，用来验证进程能起来。

---

## `@Controller()`

括号里**没**写路径，意味着根路径。也就是说这个 controller 的路由前缀是 `""`，整个项目目前唯一的根路由就是这里的 `@Get()`。

---

## `constructor(private readonly appService: AppService) {}`

Nest 通过 TypeScript 的**参数属性（parameter properties）**自动注入依赖。这是 Nest 的核心机制：

- `private readonly appService: AppService` — 既是构造函数参数，又是类字段；
- Nest 看到构造函数是空的、参数类型是个 provider 类（`AppService`），就自动从 IoC 容器里拿一个实例塞进 `this.appService`；
- 你不用 `import { Inject }` 之类，`getHello()` 里 `this.appService` 永远有值（前提是 `AppService` 在某个模块的 `providers` 数组里注册了）。

`readonly` 表示引用不可改，但对象的内部状态可以——`AppService` 一般是单例的。

---

## `@Get()` + `getHello()`

```ts
@Get()
getHello(): string {
  return this.appService.getHello();
}
```

- `@Get()` 没传路径，对应 `GET /`。
- handler 直接返回值 `string`，Nest 默认序列化成 JSON 字符串。但因为是 `string` 不是对象，**响应体就是裸字符串** `"Hello World!"`（不是 `"Hello World!"` 包成 `JSON.stringify` 的结果）。

---

## 这一层"Hello world"在生产里通常被替换

工程实践里这个 controller 要么删掉，要么改成健康检查：

```ts
@Get('health')
health() {
  return { status: 'ok', uptime: process.uptime() };
}
```

你目前保留它只是为了：
1. 验证 `app.listen` 起来了；
2. 验证 `AppService` 的 DI 链路通了；
3. 跑 `pnpm start:dev` 后第一时间能 curl 一下确认。

---

## 为什么不把业务路由也写这里

一旦业务接口变多，`AppController` 会膨胀——破坏单一职责。**正确做法**是按业务拆模块（你已经在做了）：`UsersModule` 装用户，`ReportsModule` 装报告。脚手架默认的 `AppController` 留作脚手架根路径就好了。
