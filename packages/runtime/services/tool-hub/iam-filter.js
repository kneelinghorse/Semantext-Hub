import { authorize as defaultAuthorize } from '../../security/iam.mjs';

export class IAMFilter {
  constructor(options = {}) {
    this.authorize = options.authorize ?? defaultAuthorize;
    this.logger = options.logger ?? console;
    this.requireActor = options.requireActor ?? false;
    this.denyOnError = options.denyOnError !== false;
    this.allowImplicitGrant = options.allowImplicitGrant ?? true;
  }

  async filter(results, actor = {}) {
    if (!Array.isArray(results) || results.length === 0) {
      return [];
    }

    const actorId =
      actor?.id ??
      actor?.urn ??
      actor?.agent ??
      actor?.agent_id ??
      actor?.principal ??
      null;
    const actorCapabilities = Array.isArray(actor?.capabilities)
      ? new Set(actor.capabilities.map((value) => String(value).trim()).filter(Boolean))
      : new Set();

    const filtered = [];
    for (const result of results) {
      const capabilities = Array.isArray(result?.capabilities)
        ? result.capabilities.map((value) => String(value).trim()).filter(Boolean)
        : [];

      if (capabilities.length === 0) {
        filtered.push({
          ...result,
          iam: {
            allowed: true,
            reason: 'no_capabilities',
            actor: actorId ?? null
          }
        });
        continue;
      }

      if (!actorId && this.requireActor) {
        this.logger?.warn?.('[iam-filter] Rejecting result - missing actor identity', {
          urn: result?.urn ?? result?.tool_id ?? null
        });
        continue;
      }

      let allowed = true;
      const decisions = [];

      for (const capability of capabilities) {
        if (!capability) {
          continue;
        }

        if (actorCapabilities.has(capability)) {
          decisions.push({
            capability,
            allowed: true,
            source: 'actor_capabilities'
          });
          continue;
        }

        if (!actorId) {
          if (this.allowImplicitGrant) {
            decisions.push({
              capability,
              allowed: true,
              source: 'implicit_allow'
            });
            continue;
          }
          decisions.push({
            capability,
            allowed: false,
            source: 'missing_actor'
          });
          allowed = false;
          break;
        }

        if (typeof this.authorize !== 'function') {
          if (this.allowImplicitGrant) {
            decisions.push({
              capability,
              allowed: true,
              source: 'no_authorizer'
            });
            continue;
          }
          decisions.push({
            capability,
            allowed: false,
            source: 'no_authorizer'
          });
          allowed = false;
          break;
        }

        try {
          const response = await this.authorize(actorId, capability, result?.urn ?? result?.tool_id ?? null);
          const granted = Boolean(response?.allowed);
          decisions.push({
            capability,
            allowed: granted,
            source: 'iam_policy',
            mode: response?.mode ?? null,
            reason: response?.reason ?? null
          });
          if (!granted) {
            allowed = false;
            break;
          }
        } catch (error) {
          this.logger?.warn?.('[iam-filter] Authorization check failed', {
            actor: actorId,
            capability,
            resource: result?.urn ?? result?.tool_id ?? null,
            error: error?.message ?? error
          });
          decisions.push({
            capability,
            allowed: !this.denyOnError,
            source: 'iam_policy_error',
            error: error?.message ?? String(error)
          });
          if (this.denyOnError) {
            allowed = false;
            break;
          }
        }
      }

      if (allowed) {
        filtered.push({
          ...result,
          iam: {
            allowed: true,
            actor: actorId ?? null,
            decisions
          }
        });
      } else {
        this.logger?.debug?.('[iam-filter] Excluding tool due to IAM denial', {
          actor: actorId,
          urn: result?.urn ?? result?.tool_id ?? null
        });
      }
    }

    return filtered;
  }
}

export default IAMFilter;
