import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestUser } from '../auth/current-user.decorator';

@Controller('categories')
@UseGuards(JwtAuthGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /**
   * POST /categories
   * Creates a new category. Slug is auto-generated from name.
   */
  @Post()
  create(
    @CurrentUser() user: RequestUser,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(user.workspaceId, dto);
  }

  /**
   * GET /categories
   * Lists all categories for the current workspace.
   */
  @Get()
  findAll(@CurrentUser() user: RequestUser) {
    return this.categoriesService.findAll(user.workspaceId);
  }

  /**
   * PATCH /categories/:id
   * Updates a category name (slug regenerated automatically).
   */
  @Patch(':id')
  update(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.workspaceId, id, dto);
  }

  /**
   * DELETE /categories/:id
   * Deletes a category. Stories in this category get category_id = NULL.
   * Returns 204 No Content.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.categoriesService.remove(user.workspaceId, id);
  }
}