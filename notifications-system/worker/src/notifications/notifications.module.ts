import { Module } from "@nestjs/common";
import { RenderService } from "./render.service";
import { NotificationsController } from "./notification.controller";
import { ClientsModule, Transport } from "@nestjs/microservices";

@Module({
    imports: [
        ClientsModule.register([
            {
                name: "GO_GATEWAY_SERVICE",
                transport: Transport.KAFKA,
                options: {
                    client: {
                        brokers: [process.env.KAFKA_BROKER || "localhost:9092"],
                    },
                    consumer: {
                        groupId: "gateway-producer-group",
                    },
                }
            }
        ])
    ],
    providers: [RenderService],
    controllers: [NotificationsController],
})
export class NotificationsModule { }