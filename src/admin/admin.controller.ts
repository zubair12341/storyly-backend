import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/current-user.decorator';
import { AdminGuard } from './admin.guard';
import { AdminService } from './admin.service';
import { IsIn } from 'class-validator';

class OverridePlanDto {
  @IsIn(['free', 'pro', 'business'])
  plan!: 'free' | 'pro' | 'business';
}

class SetRoleDto {
  @IsIn(['user', 'admin'])
  role!: 'user' | 'admin';
}

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ── GET /admin/stats ──────────────────────────────────────
  @Get('stats')
  getStats() {
    return this.adminService.getStats();
  }

  // ── GET /admin/workspaces ─────────────────────────────────
  @Get('workspaces')
  getWorkspaces(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getWorkspaces(page, limit);
  }

  // ── GET /admin/workspaces/:id ─────────────────────────────
  @Get('workspaces/:id')
  getWorkspaceById(@Param('id') id: string) {
    return this.adminService.getWorkspaceById(id);
  }

  // ── POST /admin/workspaces/:id/override-plan ──────────────
  @Post('workspaces/:id/override-plan')
  overridePlan(
    @Param('id') workspaceId: string,
    @Body() dto: OverridePlanDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.adminService.overridePlan(workspaceId, dto.plan, user.userId);
  }

  // ── GET /admin/users ──────────────────────────────────────
  @Get('users')
  getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.adminService.getUsers(page, limit);
  }

  // ── POST /admin/users/:id/set-role ────────────────────────
  @Post('users/:id/set-role')
  setUserRole(
    @Param('id') targetUserId: string,
    @Body() dto: SetRoleDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.adminService.setUserRole(targetUserId, dto.role, user.userId);
  }
}
