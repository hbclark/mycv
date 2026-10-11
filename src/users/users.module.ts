import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';
import { User } from './user.entity.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([User])], // Register the User entity in the TypeORM module and create a repository for it
  providers: [UsersService, AuthService],
  controllers: [UsersController],
})
export class UsersModule {}
