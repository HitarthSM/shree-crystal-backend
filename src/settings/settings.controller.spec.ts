import { GUARDS_METADATA } from '@nestjs/common/constants';
import { SettingsController } from './settings.controller.js';
import { RolesGuard } from '../common/guards/roles.guard.js';

describe('SettingsController access control', () => {
  it('applies RolesGuard so @Roles() on admin routes is enforced', () => {
    const guards: unknown[] = Reflect.getMetadata(GUARDS_METADATA, SettingsController) ?? [];
    expect(guards).toContain(RolesGuard);
  });
});
