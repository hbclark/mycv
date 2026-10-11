import { Injectable } from '@nestjs/common';
import { Report } from './report.entity.js';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';

@Injectable()
export class ReportsService {
  constructor(
    @InjectRepository(Report)
    private repo: Repository<Report>,
  ) {}

  create(email: string, price: number) {
    const report = this.repo.create({ price });
    return this.repo.save(report);
  }
}
