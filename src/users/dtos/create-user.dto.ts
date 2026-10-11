import { IsString, IsEmail } from 'class-validator';
//pnpm add class-validator class-transformer
export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}
