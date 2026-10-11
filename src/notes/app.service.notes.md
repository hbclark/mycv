# `app.service.ts` 解读

> 配套文件：`src/app.service.ts`

## 文件原文

```ts
import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World!';
  }
}
```

这是个**最小可用的 service**。和 `app.controller.ts` 一起被脚手架生成，平时没什么存在感，只是根模块里"有什么东西"的一个模板。

---

## `@Injectable()`

这个装饰器标记类**可以被 Nest 的 DI 容器管理**。它是 Nest 提供者（provider）的最常见形式，其它 provider 形式还有：

- `@Injectable()` 装饰的 service 类
- 自定义值（`{ provide: 'TOKEN', useValue: 42 }`）
- 工厂（`{ provide: 'TOKEN', useFactory: () => ... }`）

加了 `@Injectable()` 还**不够**——还得在某个模块的 `providers` 数组里**列出来**，才有 DI 资格。本项目就是 `app.module.ts` 的 `providers: [AppService]`。

---

## `getHello()`

```ts
getHello(): string {
  return 'Hello World!';
}
```

这就是一个**普通方法**。Nest 的 service 没什么"魔法接口"——你写啥业务方法都行。`@Injectable()` 唯一做的事情是让这个类**可以被注入到别处**，比如 `AppController` 的构造函数里。

---

## 生命周期

- 默认 `scope: 'DEFAULT'`（**单例**）：整个进程只有一个 `AppService` 实例。
- 所有 `AppController` 的实例共享**同一个** `AppService`。
- 进程生命周期内不会销毁重建。

如果哪天你需要"每个请求一个 service"（基本用不到），可以：

```ts
@Injectable({ scope: Scope.REQUEST })
export class PerRequestService {}
```

这要付额外的 DI 开销，不要没事乱开。

---

## 总结

- 这是 Nest 用来演示"controller 调用 service"模式的占位代码。
- 你的真正业务在 `UsersService` 和 `ReportsService`，逻辑远多于这一行 `getHello`。
- 当新手看到 `@Injectable()` 时，把它当作"这个类可以被注入到其它地方"的标记即可——它本身**不会**让类有什么特殊行为。
