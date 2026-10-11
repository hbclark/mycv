# `reports.service.spec.ts` 解读

> 配套文件：`src/reports/reports.service.spec.ts`

## 文件原文

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { ReportsService } from './reports.service.js';

describe('ReportsService', () => {
  let service: ReportsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ReportsService],
    }).compile();

    service = module.get<ReportsService>(ReportsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

脚手架生成的 service 单测骨架。

---

## "能跑吗？"

和 `users.service.spec.ts` 类似，**不一定**。`ReportsService` 构造里依赖 `Repository<Report>`：

```ts
constructor(
  @InjectRepository(Report)
  private repo: Repository<Report>,
) {}
```

当前 spec **没**列出 Repository，会触发 Nest DI 报错：

```
Nest can't resolve dependencies of the ReportsService.
```

要让这个 spec 真的跑通，需要：

```ts
import { getRepositoryToken } from '@nestjs/typeorm';
import { Report } from './report.entity.js';
import { vi } from 'vitest';

const mockRepo = {
  create: vi.fn(),
  save: vi.fn(),
};

Test.createTestingModule({
  providers: [
    ReportsService,
    {
      provide: getRepositoryToken(Report),
      useValue: mockRepo,
    },
  ],
}).compile();
```

---

## 加测试覆盖

```ts
describe('create', () => {
  it('persists a report with the given price', async () => {
    const user = { id: 1, email: 'a@b.c' };
    const report = { id: 100, price: 199, user };
    mockRepo.create.mockReturnValue(report);
    mockRepo.save.mockResolvedValue(report);

    const result = await service.create(199, user);
    expect(result).toEqual(report);
    expect(mockRepo.create).toHaveBeenCalledWith({ price: 199, user });
  });
});
```

---

## 一个常见审视点

⚠️ 当前 `create(email: string, price: number)`：**email 参数未使用**（看 `reports.service.notes.md`）。从测试角度，如果服务接口设计稳定，才好断言。如果接口本身就有 bug（这里的死参数），测试也应当捕捉：

```ts
it('passes user (or equivalent) to the repository', async () => {
  const user = { id: 1 };
  await service.create(user, 100);    // 即使接口错，这里也能反映预期
  expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({
    price: 100,
  }));
});
```

不过现阶段 service "什么都被传了但什么都用不上"，测试覆盖面是有限的。要么**改 service** 让 email 真的有效，要么修接口让它更语义化。

---

## 总结

- 这份 spec 跑不起来：没注入 Repository。
- 修真测试需要：mock Repository，写对 `create` 的断言。
- 配合 `reports.service` 那个**死参数**的设计：测试要承担"标记 bug"的角色，要么改 service，要么改测试覆盖要求。
