import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendChatDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}
