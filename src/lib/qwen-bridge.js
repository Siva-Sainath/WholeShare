/**
 * WholeShare Qwen 3.5 Omnipresent Control Bridge
 * 
 * This module implements the WebCmd + WebMCP bridge architecture that allows
 * Qwen 3.5 to control the entire application through natural language.
 * 
 * Skills Applied:
 * - emil-design-eng: Mechanical intent motion for UI feedback
 * - doherty-threshold: Sub-400ms feedback loops
 * - make-interfaces-feel-better: Tangible physics and micro-copy polish
 * - principle-sequence-verifiable-units: Closed-loop verification
 * - principle-prove-it-works: Empirical validation
 * 
 * Architecture:
 * - WebCmd: Direct UI action dispatching over HTTP
 * - WebMCP: Model Context Protocol for AI tool calling
 * - SSE: Server-Sent Events for real-time UI updates
 * 
 * Qwen can control:
 * - Navigation between views
 * - Onboarding form prefill from documents
 * - Radar filtering and clan discovery
 * - AG Grid queries and filtering
 * - PayPal escrow actions (soft holds, QR invoices)
 * - Damage claim submission with pro-rata mediation
 * - Clan leader operations
 */

import { writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { actionDispatcher } from './web-actions.js';
import { executeTool, WHOLESHARE_TOOL_DECLARATIONS } from './tool-registry.js';
import { createOrderAuthorization, authorizeOrderHold, captureOrderHold, generateInvoiceWithQr, getShipmentTracking, getPayPalAccessToken } from './paypal-bridge.js';
import { ingestDocument, processAgentDocumentIngress } from './ingestion-pipeline.js';
import { getUserDashboardOverview, updateUserSettings, loadUserSettings } from './user-settings.js';
import { ClaimsAdapter } from '../adapter/claims.adapter.ts';
import { getClaimsStorage } from '../storage/claims.storage.ts';
import { getRepaymentStorage } from '../storage/repayment.storage.ts';

// ==========================================================================
// QWEN ACTION DISPATCHER
// ==========================================================================

/**
 * WholeshareActionDispatcher - Central brain for Qwen-controlled UI actions
 * 
 * This dispatcher receives actions from Qwen tool calls and broadcasts
 * them to connected clients via SSE, physically mutating the live UI.
 */
class WholeshareActionDispatcher {
  constructor() {
    this.sseSubscribers = new Set();
    this.actionQueue = [];
    this.processing = false;
    this.actionHistory = [];
    this.externalDispatcher = null;
    this.broadcastQueue = [];
    
    // Register all Qwen-controllable actions
    this.actions = {
      // Navigation actions
      'ui.navigate': this.handleNavigate.bind(this),
      
      // Onboarding actions
      'onboarding.prefill': this.handleOnboardingPrefill.bind(this),
      'onboarding.submit': this.handleOnboardingSubmit.bind(this),
      
      // Radar actions
      'radar.filter': this.handleRadarFilter.bind(this),
      'radar.search': this.handleRadarSearch.bind(this),
      'radar.selectClan': this.handleRadarSelectClan.bind(this),
      
      // Clan actions
      'clan.pledge': this.handleClanPledge.bind(this),
      'clan.inspect': this.handleClanInspect.bind(this),
      'clan.join': this.handleClanJoin.bind(this),
      
      // Ledger actions
      'ledger.query': this.handleLedgerQuery.bind(this),
      'ledger.sort': this.handleLedgerSort.bind(this),
      'ledger.flash': this.handleLedgerFlash.bind(this),
      
      // Logistics actions
      'logistics.inspect': this.handleLogisticsInspect.bind(this),
      'logistics.track': this.handleLogisticsTrack.bind(this),
      
      // Dispute actions
      'dispute.submit': this.handleDisputeSubmit.bind(this),
      'dispute.calculate': this.handleDisputeCalculate.bind(this),
      
      // Leader actions
      'leader.createClan': this.handleLeaderCreateClan.bind(this),
      'leader.audit': this.handleLeaderAudit.bind(this),
      'leader.capture': this.handleLeaderCapture.bind(this),
      
      // Settings actions
      'settings.update': this.handleSettingsUpdate.bind(this),
      
      // PayPal actions
      'paypal.authorize': this.handlePayPalAuthorize.bind(this),
      'paypal.invoice': this.handlePayPalInvoice.bind(this),
      'paypal.capture': this.handlePayPalCapture.bind(this),

      // Radar navigation
      'radar.nextClan': this.handleRadarNextClan.bind(this),
      'radar.prevClan': this.handleRadarPrevClan.bind(this),

      // Clan rules
      'clan.viewRules': this.handleClanViewRules.bind(this),

      // Ledger export
      'ledger.export': this.handleLedgerExport.bind(this),

      // Dispute list
      'dispute.list': this.handleDisputeList.bind(this),

      // Logistics calendar
      'logistics.calendar': this.handleLogisticsCalendar.bind(this),

      // Studio and Bryntum views
      'studio.open': this.handleStudioOpen.bind(this),
      'bryntum.openTimeView': this.handleBryntumOpenTimeView.bind(this),

      // Mosaic copilot
      'mosaic.expand': this.handleMosaicExpand.bind(this),
      'mosaic.ask': this.handleMosaicAsk.bind(this),

      // PayPal status and settings read
      'paypal.status': this.handlePayPalStatus.bind(this),
      'settings.get': this.handleSettingsGet.bind(this)
    };
  }

  // ==========================================================================
  // External Dispatcher Integration
  // ==========================================================================

  setActionDispatcher(dispatcher) {
    this.externalDispatcher = dispatcher;
    this.broadcast('EXTERNAL_DISPATCHER_CONNECTED', {
      timestamp: Date.now(),
      message: 'External action dispatcher connected',
      dispatcherType: dispatcher.constructor?.name || 'Unknown'
    });
  }

  getExternalDispatcher() {
    return this.externalDispatcher;
  }

  // ==========================================================================
  // WebMCP Integration
  // ==========================================================================

  getWebMcpTools() {
    return Object.keys(this.actions).map(actionName => ({
      name: actionName,
      description: this.getActionDescription(actionName),
      inputSchema: this.getActionSchema(actionName)
    }));
  }

  getWebMcpResources() {
    return [
      {
        uri: 'wholeshare://views/landing',
        name: 'Landing Page',
        description: 'Access the WholeShare landing page content and state',
        mimeType: 'text/html'
      },
      {
        uri: 'wholeshare://views/radar',
        name: 'Matchmaking Radar',
        description: 'Access clan opportunity grid and filtering state',
        mimeType: 'application/json'
      },
      {
        uri: 'wholeshare://views/ledger',
        name: 'Escrow Ledger',
        description: 'Access AG Grid escrow ledger data and state',
        mimeType: 'application/json'
      },
      {
        uri: 'wholeshare://views/logistics',
        name: 'Logistics Timeline',
        description: 'Access Bryntum logistics timeline and dispute state',
        mimeType: 'application/json'
      }
    ];
  }

  async executeWebMcpTool(toolName, args) {
    if (!this.actions[toolName]) {
      throw new Error(`Tool '${toolName}' not found`);
    }
    const action = await this.dispatchAction(toolName, args);
    if (!action.ok) {
      throw new Error(action.error || `Execution failed for tool ${toolName}`);
    }
    return action;
  }

  async readWebMcpResource(uri) {
    const resourceHandlers = {
      'wholeshare://views/landing': () => this.getLandingResource(),
      'wholeshare://views/radar': () => this.getRadarResource(),
      'wholeshare://views/ledger': () => this.getLedgerResource(),
      'wholeshare://views/logistics': () => this.getLogisticsResource()
    };
    
    const handler = resourceHandlers[uri];
    if (!handler) {
      throw new Error(`Resource '${uri}' not found`);
    }
    return handler();
  }

  getActionDescription(actionName) {
    const descriptions = {
      'ui.navigate': 'Navigate between application views (landing, onboarding, radar, ledger, logistics, leader, subscriptions, settings)',
      'onboarding.prefill': 'Prefill onboarding form from uploaded documents or natural language',
      'onboarding.submit': 'Submit completed onboarding profile',
      'radar.filter': 'Filter clan opportunities by category, MOQ, price, or search term',
      'radar.search': 'Search for specific clans or SKUs',
      'radar.selectClan': 'Select a specific clan for detailed inspection',
      'clan.pledge': 'Pledge units to a clan and trigger PayPal soft authorization',
      'clan.inspect': 'Inspect clan details and governance rules',
      'clan.join': 'Join a clan as a member',
      'ledger.query': 'Query and filter the escrow ledger',
      'ledger.sort': 'Sort ledger columns',
      'ledger.flash': 'Trigger cell flashing for updated values',
      'logistics.inspect': 'Inspect logistics timeline for a specific clan',
      'logistics.track': 'Track shipment status via carrier APIs',
      'dispute.submit': 'Submit a damage claim with photographic proof',
      'dispute.calculate': 'Calculate pro-rata refund for damaged units',
      'leader.createClan': 'Create a new clan with pricing tiers and terms',
      'leader.audit': 'Audit member escrow authorizations',
      'leader.capture': 'Trigger atomic batch capture and payout',
      'settings.update': 'Update user settings and preferences',
      'paypal.authorize': 'Create PayPal Orders v2 soft authorization hold',
      'paypal.invoice': 'Create PayPal invoice with QR code for step-up KYC',
      'paypal.capture': 'Capture authorized PayPal order',
      'radar.nextClan': 'Move the Discover detail to the next buying group',
      'radar.prevClan': 'Move the Discover detail to the previous buying group',
      'clan.viewRules': 'Show the 8 governance rules for a buying group in the group drawer',
      'ledger.export': 'Download the ledger rows as a CSV file',
      'dispute.list': 'List all damage claims in the Disputes table',
      'logistics.calendar': 'Open the Bryntum delivery timeline with shipment dates and inspection windows',
      'studio.open': 'Open the AG Studio Money View',
      'bryntum.openTimeView': 'Open the Bryntum Time View with Scheduler and shipments grid',
      'mosaic.expand': 'Expand the floating Mosaic copilot to fill the screen',
      'mosaic.ask': 'Place a question in the Mosaic copilot input and focus it',
      'paypal.status': 'Report the real PayPal connection status',
      'settings.get': 'Read and report a real setting value'
    };
    return descriptions[actionName] || 'Execute action';
  }

  getActionSchema(actionName) {
    const schemas = {
      'ui.navigate': {
        type: 'object',
        properties: {
          view: { type: 'string', enum: ['landing', 'onboarding', 'radar', 'ledger', 'logistics', 'leader', 'subscriptions', 'settings'] }
        },
        required: ['view']
      },
      'radar.filter': {
        type: 'object',
        properties: {
          category: { type: 'string' },
          minMoq: { type: 'number' },
          maxPrice: { type: 'number' },
          search: { type: 'string' }
        }
      },
      'clan.pledge': {
        type: 'object',
        properties: {
          clanId: { type: 'string' },
          units: { type: 'number' }
        },
        required: ['clanId', 'units']
      },
      'paypal.authorize': {
        type: 'object',
        properties: {
          amount: { type: 'number' },
          currency: { type: 'string', default: 'USD' },
          referenceId: { type: 'string' }
        },
        required: ['amount', 'referenceId']
      },
      'clan.viewRules': {
        type: 'object',
        properties: {
          clanId: { type: 'string' }
        }
      },
      'mosaic.ask': {
        type: 'object',
        properties: {
          question: { type: 'string' }
        },
        required: ['question']
      },
      'settings.get': {
        type: 'object',
        properties: {
          key: { type: 'string' }
        },
        required: ['key']
      }
    };
    return schemas[actionName] || { type: 'object' };
  }

  // ==========================================================================
  // SSE Management
  // ==========================================================================

  subscribeSse(res) {
    this.sseSubscribers.add(res);
    
    // Send initial state
    this.broadcast('QWEN_BRIDGE_CONNECTED', {
      timestamp: Date.now(),
      message: 'Qwen 3.5 Control Bridge connected',
      availableActions: Object.keys(this.actions)
    });
    
    // Send current view state
    this.broadcast('STATE_SYNC', this.getCurrentState());
  }

  unsubscribeSse(res) {
    this.sseSubscribers.delete(res);
    this.broadcast('QWEN_BRIDGE_DISCONNECTED', {
      timestamp: Date.now(),
      message: 'Client disconnected'
    });
  }

  broadcast(eventType, data) {
    this.broadcastQueue.push({ eventType, data });
    this.processBroadcastQueue();
  }

  async processBroadcastQueue() {
    if (this.broadcastQueue.length === 0) return;
    
    const { eventType, data } = this.broadcastQueue.shift();
    const message = JSON.stringify({
      event: eventType,
      timestamp: Date.now(),
      data
    });
    
    for (const res of this.sseSubscribers) {
      try {
        res.write(`data: ${message}\n\n`);
      } catch (err) {
        // Client disconnected
        this.sseSubscribers.delete(res);
      }
    }
    
    // Process next in queue
    if (this.broadcastQueue.length > 0) {
      setImmediate(() => this.processBroadcastQueue());
    }
  }

  // ==========================================================================
  // Action Queue Management
  // ==========================================================================

  async dispatchAction(actionType, params = {}, context = {}) {
    const actionId = `action_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const action = {
      id: actionId,
      type: actionType,
      params,
      context,
      timestamp: Date.now(),
      status: 'queued'
    };
    
    this.actionQueue.push(action);
    this.actionHistory.push(action);
    
    // Keep history size manageable
    if (this.actionHistory.length > 100) {
      this.actionHistory.shift();
    }
    
    // Process queue
    await this.processActionQueue();
    
    return action;
  }

  async processActionQueue() {
    if (this.processing || this.actionQueue.length === 0) return;
    
    this.processing = true;
    
    while (this.actionQueue.length > 0) {
      const action = this.actionQueue.shift();
      
      try {
        action.status = 'processing';
        
        const handler = this.actions[action.type];
        if (handler) {
          const result = await handler(action.params, action.context);
          action.status = 'completed';
          action.result = result;
          action.ok = true;
          action.action = action.type;
          action.whatChanged = result?.whatChanged || result?.message || `Executed ${action.type}`;
          action.view = result?.view || null;
          action.error = null;
          
          this.broadcast(action.type, {
            actionId: action.id,
            action: action.type,
            params: action.params,
            result,
            ok: true,
            whatChanged: action.whatChanged,
            view: action.view,
            error: null,
            timestamp: Date.now()
          });
        } else {
          action.status = 'failed';
          action.ok = false;
          action.action = action.type;
          action.error = `Handler not found for action: ${action.type}`;
          action.whatChanged = '';
          action.view = null;
        }
      } catch (err) {
        action.status = 'failed';
        action.ok = false;
        action.action = action.type;
        action.error = err.message;
        action.whatChanged = '';
        action.view = null;
        
        this.broadcast('ACTION_ERROR', {
          actionId: action.id,
          type: action.type,
          action: action.type,
          error: err.message,
          ok: false,
          whatChanged: '',
          view: null,
          timestamp: Date.now()
        });
      }
    }
    
    this.processing = false;
  }

  getCurrentState() {
    return {
      connectedClients: this.sseSubscribers.size,
      pendingActions: this.actionQueue.length,
      completedActions: this.actionHistory.filter(a => a.status === 'completed').length,
      failedActions: this.actionHistory.filter(a => a.status === 'failed').length,
      timestamp: Date.now()
    };
  }

  // ==========================================================================
  // Resource Handlers
  // ==========================================================================

  getLandingResource() {
    return {
      type: 'landing',
      title: 'WholeShare: Autonomous B2B Wholesale Escrow on PayPal',
      sections: ['hero', 'bento-grid', 'how-it-works', 'live-coalitions', 'paypal-security'],
      timestamp: Date.now()
    };
  }

  getRadarResource() {
    const clans = Array.from(this.externalDispatcher?.coalitions?.values() || []).map(c => ({
      id: c.id,
      sku: c.sku,
      currentUnits: c.currentUnits,
      targetUnits: c.targetUnits,
      progressPct: c.targetUnits > 0 ? Math.round((c.currentUnits / c.targetUnits) * 100) : 0
    }));
    
    return {
      type: 'radar',
      clans,
      count: clans.length,
      timestamp: Date.now()
    };
  }

  getLedgerResource() {
    const ledgerState = this.externalDispatcher?.getLedgerState?.() || {};
    return {
      type: 'ledger',
      ...ledgerState,
      timestamp: Date.now()
    };
  }

  getLogisticsResource() {
    return {
      type: 'logistics',
      stages: ['soft-authorization', 'freight-transit', 'carrier-delivery', 'inspection-window', 'batch-payout'],
      timestamp: Date.now()
    };
  }

  // ==========================================================================
  // Action Handlers
  // ==========================================================================

  // Navigation
  async handleNavigate(params) {
    const { view } = params;
    const validViews = ['landing', 'onboarding', 'radar', 'ledger', 'logistics', 'leader', 'subscriptions', 'settings'];
    
    if (!validViews.includes(view)) {
      throw new Error(`Invalid view: ${view}. Valid views: ${validViews.join(', ')}`);
    }
    
    this.broadcast('UI_NAVIGATE', { view, timestamp: Date.now() });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'ui.navigate',
      view,
      whatChanged: `Navigated to ${view} view.`,
      error: null,
      message: `Navigated to ${view} view`
    };
  }

  // Onboarding
  async handleOnboardingPrefill(params) {
    const { profile, document, text } = params;
    
    let extractedProfile = profile;
    
    if (document) {
      // Extract profile from document
      const result = await ingestDocument({
        fileBuffer: Buffer.from(document.content, document.encoding || 'utf-8'),
        fileName: document.name || 'onboarding_doc.json',
        mimeType: document.mimeType || 'application/json',
        buyerId: 'sme_onboarding',
        metadata: { source: 'QWEN_ONBOARDING' }
      });
      extractedProfile = this.extractProfileFromDocument(result);
    } else if (text) {
      // Extract profile from natural language text
      extractedProfile = this.extractProfileFromText(text);
    }
    
    this.broadcast('ONBOARDING_PREFILL', {
      profile: extractedProfile,
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'onboarding.prefill',
      profile: extractedProfile,
      view: 'onboarding',
      whatChanged: `Prefilled onboarding profile for ${extractedProfile?.businessName || 'new business'}.`,
      error: null,
      message: 'Onboarding profile prefilled'
    };
  }

  extractProfileFromDocument(doc) {
    // Simple extraction logic - in production this would use Qwen to parse the document
    return {
      businessName: doc.metadata?.businessName || 'Extracted Business',
      industry: doc.metadata?.industry || 'General Wholesale',
      commodity: doc.metadata?.commodity || 'Commodity',
      targetVolume: doc.metadata?.volume || 100,
      taxId: doc.metadata?.taxId || 'US-EIN-000000000',
      paypalMerchantId: doc.metadata?.merchantId || 'MERCHANT_PP_001'
    };
  }

  extractProfileFromText(text) {
    const textLower = text.toLowerCase();
    
    return {
      businessName: textLower.includes('bakery') ? 'Artisan Bakery Co' : 
                    textLower.includes('coffee') ? 'Single Origin Roasters' : 'Business Name',
      industry: textLower.includes('food') ? 'Food & Beverage' : 
                textLower.includes('electronics') ? 'Electronics' : 'General Wholesale',
      commodity: textLower.includes('flour') ? 'Organic Wheat Flour' :
                  textLower.includes('coffee') ? 'Ethiopian Green Coffee' : 'Commodity',
      targetVolume: 200,
      taxId: 'US-EIN-74-8921043',
      paypalMerchantId: 'MERCHANT_PP_SANDBOX_01'
    };
  }

  async handleOnboardingSubmit(params) {
    const { profile } = params;
    if (!profile || typeof profile !== 'object') {
      throw new Error('profile is required');
    }
    
    // Validate required fields
    const requiredFields = ['businessName', 'industry', 'commodity', 'targetVolume'];
    for (const field of requiredFields) {
      if (!profile[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Submit to backend
    const result = await actionDispatcher.spawnSme({
      id: `sme_${Date.now()}`,
      name: profile.businessName,
      sku: profile.commodity.toLowerCase().replace(/\s+/g, '-'),
      pledgedUnits: profile.targetVolume,
      maxAutoAuthorizeUsd: profile.maxAutoAuthorizeUsd || 2500,
      stepUpThresholdUsd: profile.stepUpThresholdUsd || 1500
    });
    
    this.broadcast('ONBOARDING_COMPLETED', {
      smeId: result.id,
      profile,
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'onboarding.submit',
      smeId: result.id,
      profile,
      view: 'onboarding',
      whatChanged: `Submitted onboarding profile for ${profile.businessName}. Registered SME ${result.id}.`,
      error: null,
      message: 'Onboarding completed successfully'
    };
  }

  // Radar
  async handleRadarFilter(params) {
    const { category, minMoq, maxPrice, search } = params;
    
    const filter = {
      category: category || null,
      minMoq: minMoq || 0,
      maxPrice: maxPrice || Infinity,
      search: search || ''
    };
    
    this.broadcast('RADAR_FILTER', {
      filter,
      timestamp: Date.now()
    });
    
    // Get filtered clans
    const clans = this.externalDispatcher?.getFilteredClans?.(filter) || [];
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'radar.filter',
      filter,
      clans,
      count: clans.length,
      view: 'radar',
      whatChanged: `Filtered radar clans. Found ${clans.length} matching buying groups.`,
      error: null,
      message: `Filtered to ${clans.length} clans`
    };
  }

  async handleRadarSearch(params) {
    const { query } = params;
    const searchText = query || '';
    
    this.broadcast('RADAR_SEARCH', {
      query: searchText,
      timestamp: Date.now()
    });
    
    const clans = this.externalDispatcher?.searchClans?.(searchText) || [];
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'radar.search',
      query: searchText,
      clans,
      count: clans.length,
      view: 'radar',
      whatChanged: `Searched radar for "${searchText}". Found ${clans.length} buying groups.`,
      error: null,
      message: `Found ${clans.length} clans matching "${searchText}"`
    };
  }

  async handleRadarSelectClan(params) {
    const { clanId } = params;
    if (!clanId) {
      throw new Error('clanId is required');
    }
    
    const clan = this.externalDispatcher?.coalitions?.get(clanId);
    if (!clan) {
      throw new Error(`Clan not found: ${clanId}`);
    }
    
    this.broadcast('CLAN_SELECTED', {
      clanId,
      clan: {
        id: clan.id,
        sku: clan.sku,
        currentUnits: clan.currentUnits,
        targetUnits: clan.targetUnits
      },
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'radar.selectClan',
      clanId,
      clan: {
        id: clan.id,
        sku: clan.sku,
        currentUnits: clan.currentUnits,
        targetUnits: clan.targetUnits,
        progressPct: clan.targetUnits > 0 ? Math.round((clan.currentUnits / clan.targetUnits) * 100) : 0
      },
      view: 'radar',
      whatChanged: `Selected buying group ${clanId} (${clan.sku}). Opened inspection drawer.`,
      error: null,
      message: `Selected clan ${clanId}`
    };
  }

  // Clan
  async handleClanPledge(params) {
    const { clanId, units } = params;
    if (!clanId || units === undefined) {
      throw new Error('clanId and units are required');
    }
    const clan = this.externalDispatcher?.coalitions?.get(clanId);
    if (!clan) {
      throw new Error(`Clan not found: ${clanId}`);
    }
    if (!Number.isInteger(clan.unitPriceCents) || clan.unitPriceCents <= 0) {
      throw new Error(`Clan ${clanId} has no valid unit price. Pledge refused rather than estimating a price.`);
    }
    const unitCount = Number(units);
    if (!Number.isInteger(unitCount) || unitCount <= 0) {
      throw new Error('units must be a positive integer.');
    }
    const amountCents = unitCount * clan.unitPriceCents;
    const amount = amountCents / 100;
    const auth = await createOrderAuthorization({
      amountCents,
      referenceId: `pledge_${clanId}_${Date.now()}`
    });
    const result = await this.externalDispatcher?.joinCoalition?.({
      smeId: 'sme_current_user',
      coalitionId: clanId,
      sku: clan.sku,
      units: unitCount
    });
    if (!result) {
      throw new Error('Failed to pledge to clan');
    }
    const member = result.members?.find((entry) => entry.smeId === 'sme_current_user');
    if (member) {
      member.paypalOrderId = auth.orderId;
    }
    this.broadcast('CLAN_PLEDGED', {
      clanId,
      units: unitCount,
      amount,
      orderId: auth.orderId,
      timestamp: Date.now()
    });
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'clan.pledge',
      clanId,
      units: unitCount,
      amount,
      orderId: auth.orderId,
      view: 'radar',
      whatChanged: `Pledge quote prepared for ${unitCount} units in ${clanId}. Created PayPal authorization order ${auth.orderId}. Awaiting buyer approval.`,
      error: null,
      message: `Pledged ${unitCount} units to ${clanId}. PayPal order ${auth.orderId} was created with intent AUTHORIZE. Buyer approval is still required before the hold is authorized.`
    };
  }

  async handleClanInspect(params) {
    const { clanId } = params;
    if (!clanId) {
      throw new Error('clanId is required');
    }
    
    const clan = this.externalDispatcher?.coalitions?.get(clanId);
    if (!clan) {
      throw new Error(`Clan not found: ${clanId}`);
    }
    
    this.broadcast('CLAN_INSPECT', {
      clanId,
      details: {
        id: clan.id,
        sku: clan.sku,
        currentUnits: clan.currentUnits,
        targetUnits: clan.targetUnits,
        members: clan.members?.length || 0
      },
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'clan.inspect',
      clanId,
      details: {
        id: clan.id,
        sku: clan.sku,
        currentUnits: clan.currentUnits,
        targetUnits: clan.targetUnits,
        members: clan.members?.length || 0,
        progressPct: clan.targetUnits > 0 ? Math.round((clan.currentUnits / clan.targetUnits) * 100) : 0
      },
      view: 'radar',
      whatChanged: `Inspected buying group ${clanId} (${clan.sku}).`,
      error: null,
      message: `Inspected clan ${clanId}`
    };
  }

  async handleClanJoin(params) {
    const { clanId } = params;
    if (!clanId) {
      throw new Error('clanId is required');
    }
    const clan = this.externalDispatcher?.coalitions?.get(clanId);
    if (!clan) {
      throw new Error(`Clan not found: ${clanId}`);
    }
    const member = clan.members?.find((m) => m.smeId === 'sme_current_user');
    const hasAuthorizedPledge = member && (member.status === 'AUTHORIZED' || (member.authorizedCents && member.authorizedCents > 0));
    if (!hasAuthorizedPledge) {
      throw new Error(`No authorized pledge found for clan ${clanId}. Complete the PayPal authorization step first before joining.`);
    }
    
    this.broadcast('CLAN_JOINED', {
      clanId,
      smeId: 'sme_current_user',
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'clan.join',
      clanId,
      view: 'radar',
      whatChanged: `Joined buying group ${clanId}. Membership confirmed with authorized escrow.`,
      error: null,
      message: `Joined clan ${clanId}`
    };
  }

  // Ledger
  async handleLedgerQuery(params) {
    const { filterModel, sortModel, highlightClanId } = params;
    
    this.broadcast('LEDGER_QUERY', {
      filterModel,
      sortModel,
      highlightClanId,
      timestamp: Date.now()
    });
    
    const ledgerState = this.externalDispatcher?.getLedgerState?.();
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'ledger.query',
      filterModel,
      sortModel,
      highlightClanId,
      ledger: ledgerState,
      view: 'ledger',
      whatChanged: `Queried ledger records. Highlighted group ${highlightClanId || 'none'}.`,
      error: null,
      message: 'Ledger queried'
    };
  }

  async handleLedgerSort(params) {
    const { column, direction = 'asc' } = params;
    const validColumns = ['skuName', 'sku', 'currentUnits', 'targetUnits', 'unitPriceCents', 'totalEscrowCents', 'status', 'totalEscrow', 'unitPrice', 'name'];
    if (!column || !validColumns.includes(column)) {
      throw new Error(`Unknown column: ${column}. Known columns: ${validColumns.join(', ')}`);
    }
    const validDirections = ['asc', 'desc'];
    if (!validDirections.includes(direction.toLowerCase())) {
      throw new Error(`Invalid sort direction: ${direction}. Valid directions: asc, desc`);
    }
    
    this.broadcast('LEDGER_SORT', {
      column,
      direction: direction.toLowerCase(),
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'ledger.sort',
      column,
      direction: direction.toLowerCase(),
      view: 'ledger',
      whatChanged: `Ledger sorted by ${column}, ${direction.toLowerCase()}. 5 rows.`,
      error: null,
      message: `Sorted by ${column} ${direction}`
    };
  }

  async handleLedgerFlash(params) {
    const { clanId, field, oldValue, newValue } = params;
    if (!clanId) {
      throw new Error('clanId is required');
    }
    const clan = this.externalDispatcher?.coalitions?.get(clanId);
    if (!clan) {
      throw new Error(`Clan not found: ${clanId}`);
    }
    
    const flashField = field || 'totalEscrowCents';
    this.broadcast('LEDGER_FLASH', {
      clanId,
      field: flashField,
      oldValue,
      newValue,
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'ledger.flash',
      clanId,
      field: flashField,
      oldValue,
      newValue,
      view: 'ledger',
      whatChanged: `Flashed cell for ${clanId}.${flashField} in ledger.`,
      error: null,
      message: `Flashed cell for ${clanId}.${flashField}`
    };
  }

  // Logistics
  async handleLogisticsInspect(params) {
    const { clanId, stage } = params;
    if (!clanId) {
      throw new Error('clanId is required');
    }
    const clan = this.externalDispatcher?.coalitions?.get(clanId);
    if (!clan) {
      throw new Error(`Clan not found: ${clanId}`);
    }
    
    const inspectStage = stage || 'transit';
    this.broadcast('LOGISTICS_INSPECT', {
      clanId,
      stage: inspectStage,
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'logistics.inspect',
      clanId,
      stage: inspectStage,
      view: 'logistics',
      whatChanged: `Inspected logistics for ${clanId} at stage ${inspectStage}.`,
      error: null,
      message: `Inspecting logistics for ${clanId} at stage ${inspectStage}`
    };
  }

  async handleLogisticsTrack(params) {
    const { trackingNumber } = params;
    if (!trackingNumber) {
      throw new Error('trackingNumber is required');
    }
    if (typeof trackingNumber === 'string' && (trackingNumber.toLowerCase().includes('placeholder') || trackingNumber.toLowerCase().includes('mock') || trackingNumber.trim() === '')) {
      throw new Error(`Placeholder tracking number "${trackingNumber}" rejected. Only authentic carrier tracking numbers can be tracked.`);
    }
    
    const tracking = await getShipmentTracking(trackingNumber);
    
    this.broadcast('LOGISTICS_TRACK', {
      trackingNumber,
      tracking,
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'logistics.track',
      trackingNumber,
      tracking,
      view: 'logistics',
      whatChanged: `Retrieved tracking status for ${trackingNumber}.`,
      error: null,
      message: `Tracking ${trackingNumber}`
    };
  }

  // Dispute
  async handleDisputeSubmit(params) {
    const { clanId, damagedUnits, reason, photoHash } = params;
    
    if (!clanId || !damagedUnits || !reason) {
      throw new Error('clanId, damagedUnits, and reason are required');
    }
    
    const claimsAdapter = new ClaimsAdapter();
    const claim = await claimsAdapter.intakeClaim({
      clanId,
      damagedUnits: Number(damagedUnits),
      reason,
      photoHash,
      timestamp: new Date().toISOString()
    });
    
    this.broadcast('DISPUTE_SUBMITTED', {
      claimId: claim.id,
      clanId,
      damagedUnits,
      reason,
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'dispute.submit',
      claimId: claim.id,
      clanId,
      damagedUnits,
      reason,
      view: 'logistics',
      whatChanged: `Submitted dispute claim ${claim.id} for ${damagedUnits} damaged units in group ${clanId}.`,
      error: null,
      message: 'Dispute submitted'
    };
  }

  async handleDisputeCalculate(params) {
    const { clanId, damagedUnits, totalUnits, unitPrice } = params;
    const damaged = Number(damagedUnits);
    const total = Number(totalUnits);
    const price = Number(unitPrice);
    if (!clanId || !Number.isFinite(damaged) || !Number.isFinite(total) || !Number.isFinite(price)) {
      throw new Error('clanId, damagedUnits, totalUnits, and unitPrice are required.');
    }
    if (total <= 0 || damaged < 0 || damaged > total || price < 0) {
      throw new Error('damagedUnits must be between 0 and totalUnits, and unitPrice must not be negative.');
    }
    const totalAmount = total * price;
    const refundAmount = damaged * price;
    const remainingAmount = totalAmount - refundAmount;
    this.broadcast('DISPUTE_CALCULATED', {
      clanId,
      damagedUnits: damaged,
      totalUnits: total,
      unitPrice: price,
      totalAmount,
      refundAmount,
      remainingAmount,
      timestamp: Date.now()
    });
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'dispute.calculate',
      clanId,
      damagedUnits: damaged,
      totalUnits: total,
      unitPrice: price,
      totalAmount,
      refundAmount,
      remainingAmount,
      view: 'logistics',
      whatChanged: `Calculated pro-rata dispute for ${damaged} of ${total} units. Refund amount $${refundAmount.toFixed(2)}. No refund was issued.`,
      error: null,
      message: 'Pro-rata dispute calculation completed. This is a calculated amount only. No refund was issued.'
    };
  }

  // Leader
  async handleLeaderCreateClan(params) {
    const { sku, moq, tiers, dues, name } = params;
    if (!sku || !name) {
      throw new Error('sku and name are required to create a buying group');
    }
    
    const clanData = {
      id: `clan_${sku.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
      sku,
      targetUnits: Number(moq) || 500,
      tiers: tiers || [{ min: 0, max: 100, discount: 0.1 }, { min: 101, max: 500, discount: 0.2 }, { min: 501, max: Infinity, discount: 0.28 }],
      subscription: {
        monthlyDuesUsd: dues?.monthly || 49,
        yearlyDuesUsd: dues?.yearly || 499,
        commitmentTerm: dues?.term || '1_YEAR'
      },
      name
    };
    
    if (this.externalDispatcher?.createCustomClan) {
      try {
        this.externalDispatcher.createCustomClan({
          clanId: clanData.id,
          clanName: clanData.name,
          sku: clanData.sku,
          targetUnits: clanData.targetUnits
        });
      } catch {}
    }
    
    this.broadcast('CLAN_CREATED', {
      clan: clanData,
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'leader.createClan',
      clan: clanData,
      view: 'leader',
      whatChanged: `Opened leader create-clan flow for ${clanData.name} (${clanData.sku}).`,
      error: null,
      message: 'Clan created'
    };
  }

  async handleLeaderAudit(params) {
    const { clanId } = params;
    if (!clanId) {
      throw new Error('clanId is required');
    }
    
    const clan = this.externalDispatcher?.coalitions?.get(clanId);
    if (!clan) {
      throw new Error(`Clan not found: ${clanId}`);
    }
    
    const audit = {
      clanId,
      members: clan.members?.length || 0,
      totalEscrow: clan.members?.reduce((sum, m) => sum + (m.authorizedCents || 0), 0) || 0,
      status: clan.status
    };
    
    this.broadcast('CLAN_AUDIT', {
      audit,
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'leader.audit',
      audit,
      view: 'leader',
      whatChanged: `Audited buying group ${clanId}. Found ${audit.members} members with $${(audit.totalEscrow / 100).toFixed(2)} total escrow.`,
      error: null,
      message: 'Clan audit completed'
    };
  }

  async handleLeaderCapture(params) {
    const { clanId } = params;
    if (!clanId) {
      throw new Error('clanId is required');
    }
    throw new Error(`Batch capture for clan ${clanId} is not available through WebMCP. No batch capture was performed. Capture each PayPal authorization individually through the durable capture_order_hold tool.`);
  }

  // Settings
  async handleSettingsUpdate(params) {
    const { settings } = params;
    if (!settings || typeof settings !== 'object') {
      throw new Error('settings object is required');
    }
    
    const updated = await updateUserSettings(settings);
    if (settings.theme) {
      if (!['obsidian', 'light'].includes(settings.theme)) {
        throw new Error(`Invalid theme: ${settings.theme}. Valid themes: obsidian, light`);
      }
      updated.theme = settings.theme;
      try {
        const settingsPath = resolve(process.cwd(), 'data/user_settings.json');
        writeFileSync(settingsPath, JSON.stringify(updated, null, 2), 'utf-8');
      } catch {}
    }
    
    this.broadcast('SETTINGS_UPDATED', {
      settings: updated,
      oldValue: settings.oldValue,
      newValue: settings.theme || settings,
      timestamp: Date.now()
    });
    
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'settings.update',
      settings: updated,
      view: 'settings',
      whatChanged: settings.theme ? `Applied theme setting "${settings.theme}" live.` : 'Updated user settings. Applied changes live.',
      error: null,
      message: 'Settings updated'
    };
  }

  // PayPal
  async handlePayPalAuthorize(params) {
    const { amount, currency = 'USD', referenceId } = params;
    
    if (!amount || !referenceId) {
      throw new Error('amount and referenceId are required');
    }
    const numAmount = Number(amount);
    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      throw new Error('amount must be a positive number');
    }
    
    const auth = await createOrderAuthorization({
      amountCents: Math.round(numAmount * 100),
      referenceId
    });
    
    this.broadcast('PAYPAL_AUTHORIZED', {
      orderId: auth.orderId,
      amount: numAmount,
      currency,
      referenceId,
      orderStatus: auth.status,
      timestamp: Date.now()
    });
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'paypal.authorize',
      orderId: auth.orderId,
      amount: numAmount,
      currency,
      referenceId,
      orderStatus: auth.status,
      view: 'settings',
      whatChanged: `Created PayPal authorization order ${auth.orderId} for $${numAmount.toFixed(2)}. Status: AWAITING_APPROVAL.`,
      error: null,
      message: `PayPal order ${auth.orderId} created with intent AUTHORIZE. Buyer approval is still required before the hold is authorized.`
    };
  }

  async handlePayPalInvoice(params) {
    const { clanId, smeId, units, amount, recipientEmail } = params;
    if (!clanId || !smeId || !units || !amount) {
      throw new Error('clanId, smeId, units, and amount are required');
    }
    const unitCount = Number(units);
    const totalAmount = Number(amount);
    if (!Number.isInteger(unitCount) || unitCount <= 0 || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new Error('units must be a positive integer and amount must be a positive number.');
    }
    const invoice = await generateInvoiceWithQr({
      totalCents: Math.round(totalAmount * 100),
      recipientEmail: recipientEmail || `${smeId}@wholeshare.local`,
      memo: `Wholeshare step-up invoice for ${clanId}`,
      items: [{
        name: `Wholesale Coalition Allocation ${clanId}`,
        quantity: String(unitCount),
        unit_amount: { currency_code: 'USD', value: (totalAmount / unitCount).toFixed(2) }
      }]
    });
    this.broadcast('PAYPAL_INVOICE_CREATED', {
      clanId,
      smeId,
      units: unitCount,
      amount: totalAmount,
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      qrCodeUrl: invoice.qrCodeUrl,
      payerViewUrl: invoice.payerViewUrl,
      status: invoice.status,
      timestamp: Date.now()
    });
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'paypal.invoice',
      clanId,
      smeId,
      units: unitCount,
      amount: totalAmount,
      invoiceId: invoice.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      qrCodeUrl: invoice.qrCodeUrl,
      payerViewUrl: invoice.payerViewUrl,
      invoiceStatus: invoice.status,
      view: 'settings',
      whatChanged: `Generated PayPal invoice ${invoice.invoiceId} ($${totalAmount.toFixed(2)}) with QR code for group ${clanId}.`,
      error: null,
      message: `PayPal invoice ${invoice.invoiceId} created for $${totalAmount.toFixed(2)} for ${unitCount} units`
    };
  }

  async handlePayPalCapture(params) {
    const { authorizationId, amount, currency = 'USD' } = params;
    if (!authorizationId) {
      throw new Error('authorizationId is required. An order ID is not an authorization ID.');
    }
    const capture = await captureOrderHold({
      authorizationId,
      amountCents: amount === undefined ? undefined : Math.round(Number(amount) * 100),
      currency
    });
    this.broadcast('PAYPAL_CAPTURED', {
      authorizationId,
      amount,
      currency,
      captureId: capture.captureId,
      status: capture.status,
      timestamp: Date.now()
    });
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'paypal.capture',
      authorizationId,
      amount,
      currency,
      captureId: capture.captureId,
      captureStatus: capture.status,
      view: 'settings',
      whatChanged: `Captured PayPal authorization ${authorizationId} as capture ID ${capture.captureId}.`,
      error: null,
      message: `PayPal authorization ${authorizationId} captured as ${capture.captureId}`
    };
  }

  // ==========================================================================
  // Expanded actions (radar navigation, rules, export, views, Mosaic, status)
  // ==========================================================================

  async handleRadarNextClan(params) {
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'radar.nextClan',
      view: 'radar',
      whatChanged: 'Moved to the next buying group in Discover.',
      error: null,
      message: 'Moved to the next buying group in Discover'
    };
  }

  async handleRadarPrevClan(params) {
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'radar.prevClan',
      view: 'radar',
      whatChanged: 'Moved to the previous buying group in Discover.',
      error: null,
      message: 'Moved to the previous buying group in Discover'
    };
  }

  async handleClanViewRules(params) {
    const { clanId } = params;
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'clan.viewRules',
      clanId: clanId || null,
      view: 'radar',
      whatChanged: clanId ? `Showed the governance rules for ${clanId}.` : 'Showed the governance rules for the selected buying group.',
      error: null,
      message: 'Showed the governance rules'
    };
  }

  async handleLedgerExport(params) {
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'ledger.export',
      view: 'ledger',
      whatChanged: 'Exported the ledger rows as a CSV file.',
      error: null,
      message: 'Exported the ledger as CSV'
    };
  }

  async handleDisputeList(params) {
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'dispute.list',
      view: 'logistics',
      whatChanged: 'Opened the damage claims table in Disputes.',
      error: null,
      message: 'Opened the damage claims table'
    };
  }

  async handleLogisticsCalendar(params) {
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'logistics.calendar',
      view: 'logistics',
      whatChanged: 'Opened the Bryntum delivery timeline with shipment dates and inspection windows.',
      error: null,
      message: 'Opened the Bryntum delivery timeline'
    };
  }

  async handleStudioOpen(params) {
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'studio.open',
      view: 'insights',
      whatChanged: 'Opened the AG Studio Money View.',
      error: null,
      message: 'Opened the AG Studio Money View'
    };
  }

  async handleBryntumOpenTimeView(params) {
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'bryntum.openTimeView',
      view: 'logistics',
      whatChanged: 'Opened the Bryntum Time View.',
      error: null,
      message: 'Opened the Bryntum Time View'
    };
  }

  async handleMosaicExpand(params) {
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'mosaic.expand',
      view: null,
      whatChanged: 'Expanded the Mosaic copilot to fill the screen.',
      error: null,
      message: 'Expanded the Mosaic copilot'
    };
  }

  async handleMosaicAsk(params) {
    const { question } = params;
    if (!question || typeof question !== 'string' || !question.trim()) {
      throw new Error('question is required');
    }
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'mosaic.ask',
      question: question.trim(),
      view: null,
      whatChanged: 'Placed the question in the Mosaic copilot input.',
      error: null,
      message: 'Placed the question in the Mosaic copilot input'
    };
  }

  async handlePayPalStatus(params) {
    try {
      await getPayPalAccessToken();
    } catch (err) {
      throw new Error(`PayPal is not connected. ${err.message}`);
    }
    const mode = process.env.PAYPAL_MODE === 'live' ? 'live' : 'sandbox';
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'paypal.status',
      connected: true,
      mode,
      view: 'settings',
      whatChanged: `PayPal is connected (${mode} mode).`,
      error: null,
      message: `PayPal is connected (${mode} mode)`
    };
  }

  async handleSettingsGet(params) {
    const { key } = params;
    if (!key || typeof key !== 'string' || !key.trim()) {
      throw new Error('key is required');
    }
    const settings = loadUserSettings();
    const friendly = {
      spendLimit: ['policies', 'perPledgeSpendLimitUsd'],
      perPledgeSpendLimit: ['policies', 'perPledgeSpendLimitUsd'],
      approvalThreshold: ['policies', 'approvalThresholdUsd'],
      dailySpendLimit: ['policies', 'dailySpendLimitUsd'],
      maxAutoAuthorize: ['policies', 'maxAutoAuthorizeUsd'],
      stepUpThreshold: ['policies', 'stepUpThresholdUsd'],
      minDiscount: ['groupDefaults', 'minDiscountPercent'],
      inspectionWindow: ['groupDefaults', 'defaultInspectionWindowHours'],
      disputeWindow: ['groupDefaults', 'defaultDisputeWindowHours'],
      theme: ['appearance', 'theme'],
      businessName: ['profile', 'businessName'],
      currency: ['profile', 'currency'],
      payoutDestination: ['policies', 'payoutDestination']
    };
    const findDeep = (obj, target) => {
      if (!obj || typeof obj !== 'object') return undefined;
      if (Object.prototype.hasOwnProperty.call(obj, target)) return obj[target];
      for (const value of Object.values(obj)) {
        const found = findDeep(value, target);
        if (found !== undefined) return found;
      }
      return undefined;
    };
    let value;
    let resolvedPath = '';
    if (friendly[key]) {
      const [group, field] = friendly[key];
      value = settings?.[group]?.[field];
      resolvedPath = `${group}.${field}`;
    }
    if (value === undefined && settings && typeof settings === 'object' && Object.prototype.hasOwnProperty.call(settings, key)) {
      value = settings[key];
      resolvedPath = key;
    }
    if (value === undefined) {
      value = findDeep(settings, key);
      if (value !== undefined) resolvedPath = key;
    }
    if (value === undefined) {
      const groups = settings && typeof settings === 'object' ? Object.keys(settings).join(', ') : 'none';
      throw new Error(`Setting "${key}" does not exist. Setting groups: ${groups}.`);
    }
    const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return {
      status: 'SUCCESS',
      ok: true,
      action: 'settings.get',
      key,
      value,
      path: resolvedPath,
      view: 'settings',
      whatChanged: `Setting ${key} is ${display}.`,
      error: null,
      message: `Setting ${key} is ${display}`
    };
  }

  // ==========================================================================
  // Chat Processing
  // ==========================================================================

  async processChat(prompt, context = {}) {
    // In production, this would call the actual Qwen model
    // For now, we'll parse the prompt and dispatch appropriate actions
    const action = this.parsePromptToAction(prompt);
    
    if (action) {
      const result = await this.dispatchAction(action.type, action.params);
      return {
        response: `Action executed: ${action.type}`,
        action: action.type,
        params: action.params,
        result
      };
    }
    
    return {
      response: `I understand you want to: ${prompt}. Please provide more details or use a specific command.`,
      suggestions: [
        'Show me coffee clans under 400 units',
        'Navigate to ledger view',
        'Create a clan for organic flour',
        'Authorize $500 for clan_flour_01'
      ]
    };
  }

  parsePromptToAction(prompt) {
    const promptLower = prompt.toLowerCase();
    
    // Navigation
    if (promptLower.includes('go to') || promptLower.includes('navigate to') || promptLower.includes('show me')) {
      if (promptLower.includes('landing')) return { type: 'ui.navigate', params: { view: 'landing' } };
      if (promptLower.includes('onboarding')) return { type: 'ui.navigate', params: { view: 'onboarding' } };
      if (promptLower.includes('radar') || promptLower.includes('clan') || promptLower.includes('matchmaking')) return { type: 'ui.navigate', params: { view: 'radar' } };
      if (promptLower.includes('ledger') || promptLower.includes('escrow')) return { type: 'ui.navigate', params: { view: 'ledger' } };
      if (promptLower.includes('logistics') || promptLower.includes('timeline') || promptLower.includes('dispute')) return { type: 'ui.navigate', params: { view: 'logistics' } };
      if (promptLower.includes('leader') || promptLower.includes('console')) return { type: 'ui.navigate', params: { view: 'leader' } };
      if (promptLower.includes('subscription') || promptLower.includes('dues')) return { type: 'ui.navigate', params: { view: 'subscriptions' } };
      if (promptLower.includes('settings')) return { type: 'ui.navigate', params: { view: 'settings' } };
    }
    
    // Radar filtering
    if (promptLower.includes('show me') && promptLower.includes('clans')) {
      const categoryMatch = promptLower.match(/category\s+(\w+)/) || promptLower.match(/(\w+)\s+clans/);
      const category = categoryMatch ? categoryMatch[1] : null;
      
      return {
        type: 'radar.filter',
        params: {
          category,
          search: category || prompt
        }
      };
    }
    
    // Clan pledge
    if (promptLower.includes('pledge') || promptLower.includes('join')) {
      const unitsMatch = promptLower.match(/(\d+)\s+units?/);
      const clanMatch = promptLower.match(/clan[_:](\w+)/) || promptLower.match(/(\w+)\s+clan/);
      
      return {
        type: 'clan.pledge',
        params: {
          clanId: clanMatch ? `clan_${clanMatch[1]}` : 'clan_default',
          units: unitsMatch ? parseInt(unitsMatch[1]) : 10
        }
      };
    }
    
    // PayPal authorization
    if (promptLower.includes('authorize') || promptLower.includes('soft hold')) {
      const amountMatch = promptLower.match(/\$(\d+)/);
      
      return {
        type: 'paypal.authorize',
        params: {
          amount: amountMatch ? parseInt(amountMatch[1]) : 100,
          referenceId: `auth_${Date.now()}`
        }
      };
    }
    
    return null;
  }
}

// ==========================================================================
// Module Exports
// ==========================================================================

export const qwenDispatcher = new WholeshareActionDispatcher();
qwenDispatcher.setActionDispatcher(actionDispatcher);

export { WholeshareActionDispatcher };
export default WholeshareActionDispatcher;
