# `users.service.spec.ts` 解读

> 配套文件：`src/users/users.service.spec.ts`

## 文件原文

```ts
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service.js';

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
```

是脚手架生成的**单元测试骨架**——只验证 `UsersService` 能实例化。

---

## 它的问题：跑不起来？

`UsersService` 构造签名：

```ts
constructor(
  @InjectRepository(User)
  private repo: Repository<User>,
) {}
```

Nest 测试模块**只**列了 `providers: [UsersService]`，没有注入这个 `repo`。运行时会报错：

```
Nest can't resolve dependencies of the UsersService (?). 
Please make sure that the argument Repository at index [0] is available...
```

需要补 Repository 注入。

---

## 修法

```ts
import { getRepositoryToken } from '@nestjs/typeorm';
import { User } from './user.entity.js';
import { vi } from 'vitest';

const mockRepo = {
  create: vi.fn(),
  save: vi.fn(),
  findOneBy: vi.fn(),
  find: vi.fn(),
  remove: vi.fn(),
};

Test.createTestingModule({
  providers: [
    UsersService,
    {
      provide: getRepositoryToken(User),
      useValue: mockRepo,
    },
  ],
}).compile();
```

`getRepositoryToken(User)` 是 Nest + TypeORM 提供的工具，把 entity 类转成 token——和 `@InjectRepository(User)` 在真实模块里使用的 token **完全一致**。

这样你就能写真正的断言：

```ts
describe('create', () => {
  it('persists a user with given email and password', async () => {
    const user = { id: 1, email: 'a@b.c', password: 'salt.hash' };
    mockRepo.create.mockReturnValue(user);
    mockRepo.save.mockResolvedValue(user);

    const result = await service.create('a@b.c', 'salt.hash');
    expect(result).toEqual(user);
    expect(mockRepo.create).toHaveBeenCalledWith({ email: 'a@b.c', password: 'salt.hash' });
  });
});

describe('findOne', () => {
  it('returns the user from repository', async () => {
    const user = { id: 7, email: 'x@y.z' };
    mockRepo.findOneBy.mockResolvedValue(user);

    const result = await service.findOne(7);
    expect(result).toEqual(user);
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: 7 });
  });

  it('returns null when repository returns null', async () => {
    mockRepo.findOneBy.mockResolvedValue(null);

    const result = await service.findOne(999);
    expect(result).toBeNull();
  });
});

describe('update', () => {
  it('updates and saves existing user', async () => {
    const existing = { id: 1, email: 'a@b.c' };
    mockRepo.findOneBy.mockResolvedValue(existing);
    mockRepo.save.mockResolvedValue({ id: 1, email: 'updated@x.y' });

    await service.update(1, { email: 'updated@x.y' });
    expect(existing.email).toBe('updated@x.y');
    expect(mockRepo.save).toHaveBeenCalled();
  });

  it('throws NotFound when user does not exist', async () => {
    mockRepo.findOneBy.mockResolvedValue(null);
    await expect(service.update(999, { email: 'x' }))
      .rejects.toThrow(NotFoundException);
  });
});
```

这些**单元测试**比起端到端测试：

- 速度快（~ms 级）；
- 不连真实 DB；
- 可独立跑每个方法。

---

## 总结

- 这份 spec **只是骨架**，跑不起来，需要把 mock Repository 注入进去。
- 真测逻辑要 mock 出：`create / save / findOneBy / find / remove` 等 Repository 方法。
- Vitest 的 `vi.fn()` 比 Jest 的 `jest.fn()` 稍微轻量，并支持 `vi.fn().mockResolvedValue(...)`，用法一样。
