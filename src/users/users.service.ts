import { Injectable, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm'; // repository
import { InjectRepository } from '@nestjs/typeorm'; // repository
import { User } from './user.entity.js'; // entity

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private repo: Repository<User>,
  ) {}
  create(email: string, password: string) {
    const user = this.repo.create({ email, password }); //return type: User
    return this.repo.save(user); //return type: Promise
  }

  findOne(id: number) {
    // if (!id) return null;
    return this.repo.findOneBy({ id }); //return type: Promise
  }

  find(email: string) {
    return this.repo.find({ where: { email: email.trim() } }); //return type: Promise
  }
  async update(id: number, attrs: Partial<User>) {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException('user not found');
    Object.assign(user, attrs);
    return this.repo.save(user);
    //return type: Promise
  }

  async remove(id: number) {
    const user = await this.findOne(id);
    if (!user) throw new NotFoundException('user not found');
    return this.repo.remove(user);
  }
}
