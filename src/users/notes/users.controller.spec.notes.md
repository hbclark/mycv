# `users.controller.spec.ts` 解读

> 配套文件：`src/users/users.controller.spec.ts`

## 文件原文

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersController } from './users.controller.js';

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
```

这是脚手架生成的**最简**单元测试——只验证 `UsersController` 能实例化（`should be defined`）。

---

## 关键点

### `Test.createTestingModule`

Nest 提供的**测试专用 DI 容器**。这里只列了 `controllers: [UsersController]`——意味着 Nest 会**反射**这个 controller 类，看它的构造函数参数类型，然后到 providers 池里找匹配的实例。

```ts
constructor(
  private usersService: UsersService,
  private authService: AuthService,
) {}
```

它需要 `UsersService` 和 `AuthService`。但测试模块里**没**列——`Test.createTestingModule` 会**报错**：

```
Nest can't resolve dependencies of the UsersController (?). 
Please make sure that the argument UsersService at index [0] is available...
```

除非你的 controller 类有 nullable 的依赖（没有）。所以这个文件**跑不起来**——除非你把 providers 加进去。

加 services 进去有几种写法：

```ts
Test.createTestingModule({
  controllers: [UsersController],
  providers: [
    UsersService,
    AuthService,

    // 但 UsersService 又有依赖：
    //   constructor(@InjectRepository(User) private repo: Repository<User>)
    // 这就必须 mock Repository
    {
      provide: 'UserRepository',
      useValue: { findOneBy: vi.fn() ... },   // vi 是 Vitest
    },
  ],
}).compile();
```

实际工程通常用 `Test.createTestingModule` + **真实的 mock 工厂**。

---

### `module.get<UsersController>(UsersController)`

从 module 实例上按类型拿 controller 实例。这是 Nest testing module 的 API。

---

### `it('should be defined')`

最弱的断言：`controller` 不为 `undefined`。它只能告诉我们"DI 配置基本正确"——不能告诉我们业务逻辑对不对。

---

## 这套 spec 实际能教你什么

跟 `app.controller.spec.ts` 类似：

| 看到 | 含义 |
|---|---|
| `Test.createTestingModule` | Nest 测试的入口 |
| `.compile()` | 构建模块、跑通 DI |
| `module.get(...)` | 取实例 |
| `it('should be defined')` | 起码"能造出来"的健康检查 |

但本文件**实际跑是不通过**的——因为依赖没列全。它是脚手架写好后**没进一步配置**的状态。

---

## 把这个 spec 真正跑起来的几种修法

### 方案 1：把所有依赖都列出来

```ts
Test.createTestingModule({
  controllers: [UsersController],
  providers: [
    UsersService,
    AuthService,
    { provide: getRepositoryToken(User), useValue: mockRepo },
  ],
}).compile();
```

这里 `getRepositoryToken(User)` 是 TypeORM 提供的工具，用来拿 `@InjectRepository(User)` 的真实注入 token（不然 DI 找不回来）。

### 方案 2：用 Vitest mock

```ts
import { vi } from 'vitest';

const usersServiceMock = {
  find: vi.fn(),
  findOne: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
};

const authServiceMock = {
  signup: vi.fn(),
  signin: vi.fn(),
};

Test.createTestingModule({
  controllers: [UsersController],
  providers: [
    { provide: UsersService, useValue: usersServiceMock },
    { provide: AuthService, useValue: authServiceMock },
  ],
}).compile();
```

这是**更可读**的写法，不需要真连 DB。

### 方案 3：写真正的集成测试

```
src/users/users.controller.integration.spec.ts
```

这个文件**起**一个临时 TestingModule，里面把 `TypeOrmModule.forRoot` 换成 `better-sqlite3` 的 `:memory:` 数据库；可以真测 CRUD 行为。

---

## 我建议你做什么

新手阶段，先**把 controller 里那个`'should be defined'`跑通**——把 providers 列上 + mock repository。后续再补具体接口的断言：

```ts
describe('whoAmI', () => {
  it('returns 401 when no userId in session', () => {
    expect(() => controller.whoAmI({ userId: undefined }))
      .toThrow(UnauthorizedException);
  });

  it('returns the user when session.userId is set', async () => {
    const user = { id: 1, email: 'a@b.c' };
    usersServiceMock.findOne.mockResolvedValue(user);
    const result = await controller.whoAmI({ userId: 1 });
    expect(result).toEqual(user);
  });
});
```

这种测试**不依赖 HTTP**——直接调 controller 方法。一次性拿到 controller 层的逻辑保证。

---

## 总结

- 当前 spec **只**够做 DI 健康检查，连断言都很弱。
- 实际能跑要做：providers 列出 → mock Repository。
- 真测试 controller 逻辑需要：mock service → 直接调 handler 方法 → 断言返回值与异常。
