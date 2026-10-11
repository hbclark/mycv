# `reports.controller.spec.ts` 解读

> 配套文件：`src/reports/reports.controller.spec.ts`

## 文件原文

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsController } from './reports.controller.js';

describe('ReportsController', () => {
  let controller: ReportsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReportsController],
    }).compile();

    controller = module.get<ReportsController>(ReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
```

脚手架生成的**单元测试骨架**。和 `users.controller.spec.ts` 同形——只是验证 `ReportsController` 能实例化。

---

## "能跑吗？"

`ReportsController` 这个类**没有**构造函数、没有依赖：

```ts
@Controller('reports')
export class ReportsController {}
```

注意它**没有写** `constructor(private ...) {}`。这意味着 Nest 测试模块不需要任何 provider 就能造它。所以这个 spec **可以**通过：

```
controllers: [ReportsController],
```

`should be defined` ✅。

`@nestjs/testing` 反射 controller 类，发现构造函数为空，就走默认 `new` 流程。OK。

---

## 它能测什么？

理论上**可以**测 controller 的具体路由——但本文件没有这些路由（`ReportsController` 类体是空的）。所以这个 spec **只能**跑骨架断言，对业务没价值。

等 controller 接入后，再补上真测试：

```ts
describe('ReportsController', () => {
  let controller: ReportsController;
  let serviceMock;

  beforeEach(async () => {
    serviceMock = { create: vi.fn() };
    const module = await Test.createTestingModule({
      controllers: [ReportsController],
      providers: [
        { provide: ReportsService, useValue: serviceMock },
      ],
    }).compile();
    controller = module.get(ReportsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    // 等你给 controller 加上 @Post() create(...) 方法之后
    // 写：
    // it('delegates to service.create with price', async () => {
    //   serviceMock.create.mockResolvedValue({ id: 1, price: 100 });
    //   await controller.create(100, mockUser);
    //   expect(serviceMock.create).toHaveBeenCalledWith(100, mockUser);
    // });
  });
});
```

---

## 这是脚手架的默认状态

Nest 模板里 `.spec.ts` 是**默认**生成的——即便你还没写任何业务代码。这种骨架文件有它的价值：

- 让你知道**测试怎么组织**；
- 提供 `Test.createTestingModule` 的参考用法；
- 当业务真正接入时，你有"出发点"。

但它的断言（`toBeDefined()`）几乎没有信息量。可以保留，也可以先 `pending`：

```ts
it.todo('create() persists a report with given price');
it.todo('listMine() returns reports owned by current user');
```

`it.todo` 是 Vitest / Jest 都支持的写法——**不强制定义实现，但起占位、清单作用**。

---

## 总结

- spec 文件**能跑**（controller 是空的，没依赖）。但断言也只是"能实例化"。
- 等 controller 接入业务后，把 providers 加进去，引入 mock。
- 现阶段的 spec 价值是"测试的样板、起点"。
