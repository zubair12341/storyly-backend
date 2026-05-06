import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';

import type { Request } from 'express';

import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('create-checkout-session')
  @UseGuards(JwtAuthGuard)
  createCheckoutSession(
    @Req() req: Request & { user: { workspaceId: string } },
    @Body() dto: CreateCheckoutSessionDto,
  ) {
    const workspaceId = req.user?.workspaceId;

    // Guard: workspaceId will be undefined if the user's JWT was issued before
    // workspaceId was added to the token payload. Force re-login to get a fresh token.
    if (!workspaceId) {
      throw new UnauthorizedException(
        'Your session is missing workspace context. Please log out and log in again.',
      );
    }

    return this.billingService.createCheckoutSession(workspaceId, dto.plan);
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  getStatus(@Req() req: Request & { user: { workspaceId: string } }) {
    const workspaceId = req.user?.workspaceId;

    if (!workspaceId) {
      throw new UnauthorizedException(
        'Your session is missing workspace context. Please log out and log in again.',
      );
    }

    return this.billingService.getStatus(workspaceId);
  }

  @Post('portal-session')
  @UseGuards(JwtAuthGuard)
  createPortalSession(@Req() req: Request & { user: { workspaceId: string } }) {
    const workspaceId = req.user?.workspaceId;

    if (!workspaceId) {
      throw new UnauthorizedException(
        'Your session is missing workspace context. Please log out and log in again.',
      );
    }

    return this.billingService.createPortalSession(workspaceId);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Req() req: Request,
    @Headers('stripe-signature') signature: string,
  ) {
    return this.billingService.handleWebhook(req.body, signature);
  }
}