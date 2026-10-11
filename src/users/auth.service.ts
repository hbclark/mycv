import { Injectable, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { randomBytes, scrypt as _scrypt } from 'crypto';
import { promisify } from 'util';

const scrypt = promisify(_scrypt);

@Injectable()
export class AuthService {
  constructor(private usersService: UsersService) {}

  async signup(email: string, password: string) {
    // See if email is in use
    const users = await this.usersService.find(email);
    if (users.length) {
      throw new BadRequestException('email in use');
    }

    // Hash  and salt the user's password
    //1.Generate a salt
    const salt = randomBytes(8).toString('hex'); // 16 characters inside

    //2. Hash the salt and password together
    const hash = (await scrypt(password, salt, 32)) as Buffer; // 32 characters inside
    //3. Join the hashed result and salt together
    const result = `${salt}.${hash.toString('hex')}`;

    //Create a new user and save it
    const user = await this.usersService.create(email, result);
    return user;
    // Return the user
  }
  async signin(email: string, password: string) {
    const [user] = await this.usersService.find(email); // return type: Promise<User[]>, user is the first element of the array
    if (!user) {
      throw new BadRequestException('user not found');
    }

    const [salt, storedHash] = user.password.split('.');
    /**
     * 1. User entity 里password 被声明成了实体属性,TypeORM 会把 user 表每一行映射成 User 实例、每个列映射成属性。
     * 2. 运行时层面(如果你被 Serialize 误导了)

      注意一个容易混淆的点:你之前看到的 API 响应里没有 password,那是 @Serialize(UserDto)(只 @Expose 了 id、email)在返回给前端的路上剥掉了它 —— 它只影响 HTTP 响应,不影响内存里的 user 对象。

      一句话:不是"为什么要 toString",而是"promisify 之后 TS 不知道返回值是什么,as Buffer 是把类型信息补回来的补丁"。
     */
    const hash = (await scrypt(password, salt, 32)) as Buffer;
    /**
     *  scrypt() 返回的是一个 Buffer(原始二进制字节),不是字符串
     *     每 1 字节 → 2 个十六进制字符
     *
     */
    if (storedHash !== hash.toString('hex')) {
      throw new BadRequestException('bad password');
    }

    return user;
  }
}
