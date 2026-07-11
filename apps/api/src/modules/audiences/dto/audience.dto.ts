import { IsArray, IsIn, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import type { AudienceRules } from '../rules';

// rules ตรวจละเอียดอีกชั้นด้วย validateRules() ใน service (bounded criterion types)
export class RulesDto {
  @IsIn(['all', 'any']) match: 'all' | 'any';
  @IsArray() criteria: unknown[];
}

export class CreateAudienceDto {
  @IsString() @IsNotEmpty() @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsObject() rules: AudienceRules;
}

export class UpdateAudienceDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(80) name?: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsObject() rules?: AudienceRules;
}

export class PreviewRulesDto {
  @IsObject() rules: AudienceRules;
}
