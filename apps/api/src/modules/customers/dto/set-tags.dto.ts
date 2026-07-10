import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class SetTagsDto {
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags: string[];
}
