# `app.controller.spec.ts` 解读

> 配套文件：`src/app.controller.spec.ts`

## 文件原文

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });
});
```

这是 Nest 脚手架默认生成的**单元测试**，验证 `AppController.getHello()` 跑得通。

测试框架用的是 **Vitest**（你 `package.json` 里能看到 `vitest.config.ts`，而不是默认的 Jest）。`describe/it/expect/beforeEach` 这些 API 是 Vitest 与 Jest 共享的，写法不区分。

---

## 整体结构

```
describe('AppController', () => {
  beforeEach(async () => { ... });       ← 每个 it() 之前都重新构造一次
  describe('root', () => {
    it('should ...', () => { ... });    ← 真正的断言
  });
});
```

- `describe` 是**测试套件**，可以嵌套。
- `it` 是**测试用例**，1 个 `it` = 1 个验证点。
- `beforeEach` 是**钩子**，本文件中它在每个 `it` 之前重建 DI 模块。

---

## `Test.createTestingModule({...}).compile()`

```ts
const app: TestingModule = await Test.createTestingModule({
  controllers: [AppController],
  providers: [AppService],
}).compile();
```

这是 Nest 提供的**测试专用 DI 容器**：

| 参数 | 含义 |
|---|---|
| `controllers` | 这组 controller 类要参与解析 |
| `providers`   | 这组 provider 类要参与解析 |

调用 `.compile()` 后，Nest 按这些声明**临时**搭一个 module。**不会真监听端口**，不会连真实 DB。你拿到的是个 `TestingModule` 实例。

⚠️ 注意：

- 这里只列了 `AppController` 和 `AppService`。如果 controller 还依赖别的 provider（比如 `UsersService`），这里**必须一并列**否则 controller 构造时拿不到依赖。
- `synchronize: true` 的 TypeORM 连接在测试里**不会启动**——你只把 controller 列出来，没把 `TypeOrmModule` 列出来，连 DB 都连不上也没事。

---

## `app.get<AppController>(AppController)`

Nest 容器暴露出的"按类型拿实例"API。等价于"从容器里取出这个类对应的实例"。

---

## `expect(...).toBe(...)`

Vitest 风格的断言。`toBe` 是**引用相等**（`===`），适合原始值（`number` / `string` / `boolean`）。

对象比较通常用 `toEqual`（深比较）。

---

## 这个测试文件能教你什么

1. 写一个 Nest controller 的标准测试流程：建模块、拿实例、断言。
2. 跑测试：`pnpm test`（看你的 `package.json` 的 scripts）。
3. 模板里只有最浅的"能定义"和"能返回正确值"两项——这正是**单元测试的最小样板**。真正的业务测试还需要：
   - mock 掉 service 来测 controller 的"分流"逻辑
   - mock 掉 repository 来测 service 的业务规则
   - 端到端测试（`test/app.e2e-spec.ts`）走真实 HTTP

---

## 跟实际"项目里的"测试相比还差什么

**mock 的缺失**：

```ts
// service 真实跑的行为会被其依赖（DB / 第三方 SDK）拖垮
// 正确做法：用 Vitest 的 vi.mock() 替掉 usersService 的方法
import { vi } from 'vitest';
const usersServiceMock = { findOne: vi.fn().mockResolvedValue({ id: 1, email: 'a@b' }) };
```

`UsersService` / `AuthService` 测试现在也是"能 `defined`"的骨架（看 `users.service.spec.ts`），是同样的样板。等真正业务复杂起来再补 mock。
