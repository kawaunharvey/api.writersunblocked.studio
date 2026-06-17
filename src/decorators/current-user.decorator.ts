// current-user.decorator.ts

import { createParamDecorator, ExecutionContext } from "@nestjs/common";

type AssignedUser = {
  userId: string;
  email: string;
  subscriptionStatus: string;
};

export const CurrentUser = createParamDecorator(
  (data: keyof AssignedUser, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If no specific property requested
    if (!data) {
      return user as AssignedUser;
    }

    // Return specific property
    return user?.[data];
  },
);
