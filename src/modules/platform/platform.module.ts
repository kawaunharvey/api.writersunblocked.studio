import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { AiModule } from "../ai/ai.module";
import { PlatformController } from "./platform.controller";
import { PlatformService } from "./platform.service";

@Module({
  imports: [
    DatabaseModule,
    AiModule,
    // GatewayModule,
  ],
  controllers: [PlatformController],
  providers: [PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
