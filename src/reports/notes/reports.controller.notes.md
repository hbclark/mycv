# `reports.controller.ts` 解读

> 配套文件：`src/reports/reports.controller.ts`

## 文件原文

```ts
import { Controller } from '@nestjs/common';

@Controller('reports')
export class ReportsController {}
```

当前这个文件**只有**一个类装饰器，没任何具体接口。

---

## 含义

- `@Controller('reports')` —— 把这个类下面所有路由挂在 `/reports` 前缀下。
- 类体为空 —— **没有任何 `@Get/@Post/...`** 装饰的方法。
- `ReportsService` 在本模块 providers 数组里**没有**被这个 controller 注入——因为 controller 没构造。

也就是说：这是一个**预留的 controller**，module 完整，service 完整，唯独 controller 还没接上。

---

## 现状

```bash
curl localhost:3000/reports
```

→ `404 Not Found`。**没有**接口暴露。

⚠️ 在 Nest 里 `@Controller('reports')` 不等于"自动提供 `GET /reports`"。你想给路由，必须有方法装饰器：

```ts
@Controller('reports')
export class ReportsController {
  @Get()
  listAll(@Query() query: ReportsQueryDto) {
    return this.reportsService.findAll(query);
  }
}
```

教程状态半成品：service 已经能 `create(price)` 落库，但**没有** controller 让外部能触发这个调用。

---

## 一个直接可写的版本（教学项目）

如果你以后要做"价格报告上传"，最小可用的 controller：

```ts
import {
  Body, Controller, Post, Param, Get, Query,
} from '@nestjs/common';
import { ReportsService } from './reports.service.js';
import { CreateReportDto } from './dtos/create-report.dto.js';
import { CurrentUser } from '../users/decorators/current-user.decorator.js';
import { User } from '../users/user.entity.js';
import { AuthGuard } from '../guards/auth.guard.js';
import { UseGuards } from '@nestjs/common';

@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}

  @Post()
  @UseGuards(AuthGuard)        // 必须登录态
  create(@Body() body: CreateReportDto, @CurrentUser() user: User) {
    return this.reportsService.create(body.price, user);
  }

  @Get()
  @UseGuards(AuthGuard)
  listMine(@CurrentUser() user: User) {
    return this.reportsService.findByUser(user.id);
  }
}
```

`@UseGuards(AuthGuard)` 是"必须登录"的入口；`@CurrentUser()` 拿当前用户（你已经有那个装饰器了）。

---

## 总结

- 这个文件**只有装饰器，没方法**。状态等价于"声明了一个 URL 前缀 /reports，但还没接入任何接口"。
- 教程阶段常见，**不是错误**。继续开发时往里面加方法即可。
- 学到这里你应该知道：`@Controller()` 不会自动生成路由——每个方法都得有方法装饰器。
