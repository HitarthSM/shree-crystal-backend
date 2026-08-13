import { IsString, IsNotEmpty, Matches, Length } from 'class-validator';

// Password policy regex: minimum 8 characters, at least one uppercase letter, one lowercase letter, and one number.
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
const PASSWORD_POLICY_MESSAGE =
  'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, and one number';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;

  @IsString()
  @IsNotEmpty()
  password!: string;
}

export class VerifyOtpDto {
  @IsString()
  @IsNotEmpty()
  tempToken!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  otp!: string;
}

export class ForgotPasswordDto {
  @IsString()
  @IsNotEmpty()
  identifier!: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  tempToken!: string;

  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  otp!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  currentPassword!: string;

  @IsString()
  @IsNotEmpty()
  @Matches(PASSWORD_REGEX, { message: PASSWORD_POLICY_MESSAGE })
  newPassword!: string;
}
