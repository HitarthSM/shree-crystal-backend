import { Controller, Post, Get, Body, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { LoginDto, ChangePasswordDto, RefreshTokenDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator.js';
import { AllowFirstLogin } from '../common/decorators/allow-first-login.decorator.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { AuthenticatedUser } from './types/auth.types.js';
import { Throttle } from '@nestjs/throttler';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto.identifier, loginDto.password);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refresh(refreshTokenDto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @AllowFirstLogin()
  @Post('change-password')
  async changePassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    // Changing the password invalidates all sessions; the caller gets a fresh token pair.
    const tokens = await this.authService.changePassword(
      user.userId,
      user.userType,
      changePasswordDto.currentPassword,
      changePasswordDto.newPassword,
    );
    return { message: 'Password changed successfully', ...tokens };
  }

  @UseGuards(JwtAuthGuard)
  @AllowFirstLogin()
  @Get('me')
  getMe(@CurrentUser() user: AuthenticatedUser) {
    // Explicit allow-list: the loaded record also holds password hash, encrypted
    // Aadhaar/PAN and other fields that must never reach a client (or its device storage).
    // Members are stored with `fullName`, not `name` — normalise to a single `name`.
    const base = {
      id: user.id,
      userId: user.userId,
      userType: user.userType,
      isFirstLogin: user.isFirstLogin,
    };
    if ('fullName' in user) {
      return {
        ...base,
        name: user.fullName,
        memberId: user.memberId,
        mobile: user.mobile,
        email: user.email,
        status: user.status,
      };
    }
    return { ...base, name: user.name, email: user.email, role: user.role };
  }

  @UseGuards(JwtAuthGuard)
  @AllowFirstLogin()
  @Post('logout')
  async logout(@CurrentUser() user: AuthenticatedUser) {
    await this.authService.logout(user.userId, user.userType);
    return { message: 'Logged out successfully' };
  }
}
