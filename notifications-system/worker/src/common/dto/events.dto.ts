/**
 * DTOs for the Events (Webhook) Controller
 */

export interface TriggerEventDto {
  eventType: string;
  eventId?: string;
  payload: EventPayload;
}

export interface EventPayload {
  userId: string;
  recipientEmail?: string;
  recipientPhone?: string;
  [key: string]: unknown; // Allow arbitrary template data
}

/**
 * The enriched payload that is forwarded downstream through Kafka
 * after webhook authentication. Strictly excludes secrets.
 */
export interface EnrichedKafkaPayload {
  userId: string;
  eventType: string;
  eventId: string;
  traceId: string;
  tenant: TenantIdentity;
  recipientEmail?: string;
  recipientPhone?: string;
  [key: string]: unknown;
}

/**
 * Minimal tenant identity forwarded through Kafka.
 * NEVER include api_key or other secrets in message brokers.
 */
export interface TenantIdentity {
  id: string;
  name: string;
  sender_email?: string | null;
  sender_name?: string | null;
  provider_config_id?: string | null;
}
