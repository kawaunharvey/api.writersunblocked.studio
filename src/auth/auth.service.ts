import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../database/prisma.service';
import { AppConfigService } from '../common/config/app-config.service';
import type { JwtPayload } from './jwt.strategy';

interface GoogleUserData {
  googleId: string;
  email: string;
  name: string | null;
  image: string | null;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: AppConfigService,
  ) {}

  async upsertGoogleUser(data: GoogleUserData) {
    const existing = await this.prisma.user.findUnique({
      where: { googleId: data.googleId },
    });

    if (existing) {
      return this.prisma.user.update({
        where: { id: existing.id },
        data: { name: data.name, image: data.image },
      });
    }

    const trialEndsAt = new Date();
    trialEndsAt.setDate(trialEndsAt.getDate() + 7);

    return this.prisma.user.create({
      data: {
        googleId: data.googleId,
        email: data.email,
        name: data.name,
        image: data.image,
        subscriptionStatus: 'trialing',
        trialEndsAt,
      },
    });
  }

  issueJwt(user: { id: string; email: string; subscriptionStatus: string | null }): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      subscriptionStatus: user.subscriptionStatus,
    };
    return this.jwtService.sign(payload);
  }
}
