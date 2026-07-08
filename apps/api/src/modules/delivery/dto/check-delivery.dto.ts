import { IsString, IsNotEmpty, IsLatitude, IsLongitude } from 'class-validator';

export class CheckDeliveryDto {
  @IsString()
  @IsNotEmpty()
  brandId: string;

  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;
}
