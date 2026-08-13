export interface NotificationGateway {
  sendSms(to: string, message: string, overrideApiKey?: string): Promise<boolean>;
  sendEmail(to: string, subject: string, body: string, overrideSmtpUrl?: string): Promise<boolean>;
}
