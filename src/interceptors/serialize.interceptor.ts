import {
  // 装饰器工厂：调用后返回一个「方法装饰器」，再 @一下就把拦截器挂到该 handler
  // 用法：@UseInterceptors(MyInterceptor) 或 @UseInterceptors(new MyInterceptor(...))
  UseInterceptors,

  // 拦截器必须实现的接口，里面只有一个 intercept() 方法
  // 自定义类 implements NestInterceptor 后才能被 @UseInterceptors / APP_INTERCEPTOR 接受
  NestInterceptor,

  // 请求上下文（HTTP / RPC / WS 统一抽象），常用 .switchToHttp() 拿 req/res，
  // 以及通过 Reflector 在上面读 metadata
  ExecutionContext,

  // 控制器方法返回值的「下一棒」，handler.handle() 返回一个 O
  // 你通常要在它上面 pipe(map(...)) 来改写响应
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { plainToClass } from 'class-transformer';

interface ClassConstructor {
  new (...args: any[]): {};
}

export function Serialize(dto: ClassConstructor) {
  /**
   * 因为new, 所以NestJs 的DI不会参与SerializeInterceptor的实例化，如果SerializeInterceptor的构造函数需要注入其他Service, 就会失败，变成undefined
   *
   */
  return UseInterceptors(new SerializeInterceptor(dto));
}
export class SerializeInterceptor implements NestInterceptor {
  constructor(private dto: ClassConstructor) {}
  intercept(context: ExecutionContext, handler: CallHandler): Observable<any> {
    // Run something before the request is handled
    return handler.handle().pipe(
      map((data: any) => {
        // Run something before the response is sent out
        return plainToClass(this.dto, data, { excludeExtraneousValues: true });
      }),
    );
  }
}