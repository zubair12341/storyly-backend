import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';

/**
 * Used on widget endpoints (POST /widget/events, GET /widget/stories).
 * Reads the raw API key from the x-api-key header, validates it,
 * and attaches { workspaceId } to request.workspace.
 *
 * Usage: @UseGuards(ApiKeyGuard) on any widget controller or route.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const rawKey = request.headers['x-api-key'];

    if (!rawKey) {
      throw new UnauthorizedException('Missing x-api-key header.');
    }

    const result = await this.apiKeysService.validate(rawKey);

    if (!result) {
      throw new UnauthorizedException('Invalid or inactive API key.');
    }

    // Attach workspace context so widget controllers can use it
    request.workspace = result;
    return true;
  }
}