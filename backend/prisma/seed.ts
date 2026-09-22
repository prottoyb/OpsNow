import {
  AssetStatus,
  CommentVisibility,
  KnowledgeArticleStatus,
  NotificationType,
  PrismaClient,
  Role,
  TicketPriority,
  TicketStatus,
} from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const DEV_PASSWORD = 'DevPassword123!';
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const hoursAgo = (h: number) => new Date(Date.now() - h * HOUR);
const daysAgo = (d: number) => new Date(Date.now() - d * DAY);

async function resetData() {
  // Deleted in FK-dependency order so this seed can be re-run safely.
  await prisma.notification.deleteMany();
  await prisma.ticketKnowledgeArticle.deleteMany();
  await prisma.ticketAsset.deleteMany();
  await prisma.knowledgeBaseArticleFeedback.deleteMany();
  await prisma.knowledgeBaseArticle.deleteMany();
  await prisma.knowledgeBaseCategory.deleteMany();
  await prisma.ticketComment.deleteMany();
  await prisma.ticketHistory.deleteMany();
  await prisma.ticketSla.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.ticketCategory.deleteMany();
  await prisma.assetAssignment.deleteMany();
  await prisma.asset.deleteMany();
  await prisma.assetType.deleteMany();
  await prisma.slaPolicy.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

async function main() {
  await resetData();

  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  // ---------------------------------------------------------------------
  // Users — one of each role, realistic names
  // ---------------------------------------------------------------------
  const [admin, teamLead, agent1, agent2, employee1, employee2, employee3] =
    await Promise.all([
      prisma.user.create({
        data: { email: 'admin@opsnow.local', passwordHash, firstName: 'Amelia', lastName: 'Ng', role: Role.Administrator },
      }),
      prisma.user.create({
        data: { email: 'teamlead@opsnow.local', passwordHash, firstName: 'Daniel', lastName: 'Osei', role: Role.TeamLead },
      }),
      prisma.user.create({
        data: { email: 'agent1@opsnow.local', passwordHash, firstName: 'Priya', lastName: 'Shah', role: Role.SupportAgent },
      }),
      prisma.user.create({
        data: { email: 'agent2@opsnow.local', passwordHash, firstName: 'Marco', lastName: 'Rossi', role: Role.SupportAgent },
      }),
      prisma.user.create({
        data: { email: 'employee1@opsnow.local', passwordHash, firstName: 'Grace', lastName: 'Kim', role: Role.Employee },
      }),
      prisma.user.create({
        data: { email: 'employee2@opsnow.local', passwordHash, firstName: 'Liam', lastName: 'Walsh', role: Role.Employee },
      }),
      prisma.user.create({
        data: { email: 'employee3@opsnow.local', passwordHash, firstName: 'Sofia', lastName: 'Torres', role: Role.Employee },
      }),
    ]);

  // ---------------------------------------------------------------------
  // Ticket categories (hierarchical)
  // ---------------------------------------------------------------------
  const hardware = await prisma.ticketCategory.create({ data: { name: 'Hardware' } });
  const software = await prisma.ticketCategory.create({ data: { name: 'Software' } });
  const network = await prisma.ticketCategory.create({ data: { name: 'Network' } });
  const accessRequest = await prisma.ticketCategory.create({ data: { name: 'Access Request' } });
  const laptopCategory = await prisma.ticketCategory.create({ data: { name: 'Laptop', parentId: hardware.id } });
  const desktopCategory = await prisma.ticketCategory.create({ data: { name: 'Desktop', parentId: hardware.id } });
  const businessApps = await prisma.ticketCategory.create({ data: { name: 'Business Applications', parentId: software.id } });
  const operatingSystem = await prisma.ticketCategory.create({ data: { name: 'Operating System', parentId: software.id } });

  // ---------------------------------------------------------------------
  // Asset types & assets
  // ---------------------------------------------------------------------
  const [laptopType, desktopType, monitorType, phoneType, peripheralType, licenseType] = await Promise.all([
    prisma.assetType.create({ data: { name: 'Laptop' } }),
    prisma.assetType.create({ data: { name: 'Desktop' } }),
    prisma.assetType.create({ data: { name: 'Monitor' } }),
    prisma.assetType.create({ data: { name: 'Phone' } }),
    prisma.assetType.create({ data: { name: 'Peripheral' } }),
    prisma.assetType.create({ data: { name: 'Software License' } }),
  ]);

  const laptop1 = await prisma.asset.create({
    data: { assetTag: 'LAPTOP-0001', name: 'Dell Latitude 5440', assetTypeId: laptopType.id, status: AssetStatus.Assigned, serialNumber: 'DL5440-0001', currentAssigneeId: employee1.id },
  });
  const laptop2 = await prisma.asset.create({
    data: { assetTag: 'LAPTOP-0002', name: 'Dell Latitude 5440', assetTypeId: laptopType.id, status: AssetStatus.InStock, serialNumber: 'DL5440-0002' },
  });
  const laptop3 = await prisma.asset.create({
    data: { assetTag: 'LAPTOP-0003', name: 'Lenovo ThinkPad T14', assetTypeId: laptopType.id, status: AssetStatus.Assigned, serialNumber: 'TP14-0003', currentAssigneeId: employee3.id },
  });
  const laptop4 = await prisma.asset.create({
    data: { assetTag: 'LAPTOP-0004', name: 'Dell Latitude 5420', assetTypeId: laptopType.id, status: AssetStatus.Retired, serialNumber: 'DL5420-0004' },
  });
  const laptop5 = await prisma.asset.create({
    data: { assetTag: 'LAPTOP-0005', name: 'MacBook Pro 14"', assetTypeId: laptopType.id, status: AssetStatus.Lost, serialNumber: 'MBP14-0005' },
  });

  const desktop1 = await prisma.asset.create({
    data: { assetTag: 'DESKTOP-0001', name: 'HP EliteDesk 800', assetTypeId: desktopType.id, status: AssetStatus.Assigned, serialNumber: 'HP800-0001', currentAssigneeId: employee2.id },
  });
  await prisma.asset.create({
    data: { assetTag: 'DESKTOP-0002', name: 'HP EliteDesk 800', assetTypeId: desktopType.id, status: AssetStatus.InStock, serialNumber: 'HP800-0002' },
  });
  const desktop3 = await prisma.asset.create({
    data: { assetTag: 'DESKTOP-0003', name: 'Dell OptiPlex 7010', assetTypeId: desktopType.id, status: AssetStatus.InRepair, serialNumber: 'OP7010-0003' },
  });

  const monitor1 = await prisma.asset.create({
    data: { assetTag: 'MONITOR-0001', name: 'Dell 24" Monitor', assetTypeId: monitorType.id, status: AssetStatus.Assigned, currentAssigneeId: employee1.id },
  });
  await prisma.asset.create({
    data: { assetTag: 'MONITOR-0002', name: 'Dell 24" Monitor', assetTypeId: monitorType.id, status: AssetStatus.InStock },
  });
  const monitor3 = await prisma.asset.create({
    data: { assetTag: 'MONITOR-0003', name: 'LG 27" UltraWide Monitor', assetTypeId: monitorType.id, status: AssetStatus.Assigned, currentAssigneeId: employee2.id },
  });

  const phone1 = await prisma.asset.create({
    data: { assetTag: 'PHONE-0001', name: 'iPhone 13', assetTypeId: phoneType.id, status: AssetStatus.InRepair, serialNumber: 'IP13-0001' },
  });
  const phone2 = await prisma.asset.create({
    data: { assetTag: 'PHONE-0002', name: 'iPhone 13', assetTypeId: phoneType.id, status: AssetStatus.Assigned, serialNumber: 'IP13-0002', currentAssigneeId: employee3.id },
  });
  const phone3 = await prisma.asset.create({
    data: { assetTag: 'PHONE-0003', name: 'Samsung Galaxy S21', assetTypeId: phoneType.id, status: AssetStatus.Retired, serialNumber: 'GS21-0003' },
  });

  const peripheral1 = await prisma.asset.create({
    data: { assetTag: 'PERIPH-0001', name: 'Logitech MX Keys Keyboard', assetTypeId: peripheralType.id, status: AssetStatus.InStock, serialNumber: 'MXKEYS-0001' },
  });
  const peripheral2 = await prisma.asset.create({
    data: { assetTag: 'PERIPH-0002', name: 'Logitech Brio Webcam', assetTypeId: peripheralType.id, status: AssetStatus.Assigned, serialNumber: 'BRIO-0002', currentAssigneeId: employee2.id },
  });
  const peripheral3 = await prisma.asset.create({
    data: { assetTag: 'PERIPH-0003', name: 'Logitech MX Master Mouse', assetTypeId: peripheralType.id, status: AssetStatus.Lost, serialNumber: 'MXMASTER-0003' },
  });

  const license1 = await prisma.asset.create({
    data: { assetTag: 'LICENSE-0001', name: 'Adobe Creative Cloud Seat', assetTypeId: licenseType.id, status: AssetStatus.Assigned, currentAssigneeId: employee1.id },
  });
  const license2 = await prisma.asset.create({
    data: { assetTag: 'LICENSE-0002', name: 'AutoCAD Seat (Legacy)', assetTypeId: licenseType.id, status: AssetStatus.Retired },
  });
  await prisma.asset.create({
    data: { assetTag: 'LICENSE-0003', name: 'Microsoft 365 E3 Seat (Spare)', assetTypeId: licenseType.id, status: AssetStatus.InStock },
  });

  await prisma.assetAssignment.createMany({
    data: [
      // Currently assigned — open assignment rows matching currentAssigneeId.
      { assetId: laptop1.id, assignedToId: employee1.id, assignedById: admin.id, assignedAt: daysAgo(120) },
      { assetId: monitor1.id, assignedToId: employee1.id, assignedById: admin.id, assignedAt: daysAgo(120) },
      { assetId: desktop1.id, assignedToId: employee2.id, assignedById: admin.id, assignedAt: daysAgo(150) },
      { assetId: laptop3.id, assignedToId: employee3.id, assignedById: admin.id, assignedAt: daysAgo(60) },
      { assetId: monitor3.id, assignedToId: employee2.id, assignedById: admin.id, assignedAt: daysAgo(50) },
      { assetId: phone2.id, assignedToId: employee3.id, assignedById: admin.id, assignedAt: daysAgo(40) },
      { assetId: peripheral2.id, assignedToId: employee2.id, assignedById: admin.id, assignedAt: daysAgo(70) },
      { assetId: license1.id, assignedToId: employee1.id, assignedById: admin.id, assignedAt: daysAgo(90) },
      // Previously assigned, now returned — asset moved to InRepair/Retired/Lost.
      { assetId: phone1.id, assignedToId: employee3.id, assignedById: admin.id, assignedAt: daysAgo(200), returnedAt: daysAgo(2) },
      { assetId: laptop4.id, assignedToId: employee2.id, assignedById: admin.id, assignedAt: daysAgo(300), returnedAt: daysAgo(30) },
      { assetId: laptop5.id, assignedToId: agent1.id, assignedById: admin.id, assignedAt: daysAgo(250), returnedAt: daysAgo(10) },
      { assetId: desktop3.id, assignedToId: employee3.id, assignedById: admin.id, assignedAt: daysAgo(180), returnedAt: daysAgo(15) },
      { assetId: phone3.id, assignedToId: employee1.id, assignedById: admin.id, assignedAt: daysAgo(220), returnedAt: daysAgo(20) },
      { assetId: peripheral3.id, assignedToId: employee3.id, assignedById: admin.id, assignedAt: daysAgo(150), returnedAt: daysAgo(5) },
      { assetId: license2.id, assignedToId: employee2.id, assignedById: admin.id, assignedAt: daysAgo(400), returnedAt: daysAgo(60) },
    ],
  });

  // ---------------------------------------------------------------------
  // SLA policies — one active policy per priority (required invariant)
  // ---------------------------------------------------------------------
  const slaByPriority = {
    [TicketPriority.Critical]: await prisma.slaPolicy.create({ data: { name: 'Critical SLA', priority: TicketPriority.Critical, responseTimeMinutes: 15, resolutionTimeMinutes: 120 } }),
    [TicketPriority.High]: await prisma.slaPolicy.create({ data: { name: 'High SLA', priority: TicketPriority.High, responseTimeMinutes: 30, resolutionTimeMinutes: 240 } }),
    [TicketPriority.Medium]: await prisma.slaPolicy.create({ data: { name: 'Medium SLA', priority: TicketPriority.Medium, responseTimeMinutes: 60, resolutionTimeMinutes: 480 } }),
    [TicketPriority.Low]: await prisma.slaPolicy.create({ data: { name: 'Low SLA', priority: TicketPriority.Low, responseTimeMinutes: 120, resolutionTimeMinutes: 1440 } }),
  };

  // ---------------------------------------------------------------------
  // Knowledge base
  // ---------------------------------------------------------------------
  const gettingStarted = await prisma.knowledgeBaseCategory.create({ data: { name: 'Getting Started' } });
  const troubleshooting = await prisma.knowledgeBaseCategory.create({ data: { name: 'Troubleshooting' } });
  const policies = await prisma.knowledgeBaseCategory.create({ data: { name: 'Policies' } });
  const howTo = await prisma.knowledgeBaseCategory.create({ data: { name: 'How-To' } });

  await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: troubleshooting.id,
      authorId: agent1.id,
      title: 'How to Reset Your Password',
      slug: 'how-to-reset-your-password',
      content: 'If you have forgotten your password, contact the service desk to request a reset link. For security, resets require verifying your identity with your manager.',
      status: KnowledgeArticleStatus.Published,
      publishedAt: daysAgo(60),
    },
  });
  await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: gettingStarted.id,
      authorId: agent2.id,
      title: 'Setting Up Your New Laptop',
      slug: 'setting-up-your-new-laptop',
      content: 'New laptops are pre-imaged with the standard OpsNow software bundle. On first boot, sign in with your company account and allow the setup wizard to finish syncing.',
      status: KnowledgeArticleStatus.Published,
      publishedAt: daysAgo(45),
    },
  });
  const vpnArticle = await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: troubleshooting.id,
      authorId: agent1.id,
      title: 'VPN Connection Issues',
      slug: 'vpn-connection-issues',
      content: 'Draft notes: check split-tunnel config and client version before escalating. Most drops are caused by an outdated VPN client.',
      status: KnowledgeArticleStatus.Draft,
    },
  });

  const printerArticle = await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: troubleshooting.id,
      authorId: agent2.id,
      title: 'Fixing Printer Spooler Errors',
      slug: 'fixing-printer-spooler-errors',
      content: 'Restart the Print Spooler service, clear the spool folder, and reinstall the printer driver if jobs remain stuck in the queue.',
      status: KnowledgeArticleStatus.Published,
      publishedAt: daysAgo(38),
    },
  });
  await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: troubleshooting.id,
      authorId: agent1.id,
      title: 'Old Ticketing System Migration Notes',
      slug: 'old-ticketing-system-migration-notes',
      content: 'Historical notes from the migration off the legacy help desk tool. Retained for reference only; the process described here no longer applies.',
      status: KnowledgeArticleStatus.Archived,
      publishedAt: daysAgo(240),
    },
  });
  await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: gettingStarted.id,
      authorId: teamLead.id,
      title: 'IT Service Desk Contact Guide',
      slug: 'it-service-desk-contact-guide',
      content: 'This guide previously listed phone extensions for the old on-call rotation. Superseded by the current escalation policy article.',
      status: KnowledgeArticleStatus.Archived,
      publishedAt: daysAgo(300),
    },
  });
  await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: policies.id,
      authorId: admin.id,
      title: 'Acceptable Use Policy Overview',
      slug: 'acceptable-use-policy-overview',
      content: 'Company devices and accounts are provided for business use. Summarizes the acceptable-use rules every employee agrees to at onboarding.',
      status: KnowledgeArticleStatus.Published,
      publishedAt: daysAgo(90),
    },
  });
  const remoteEquipmentArticle = await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: policies.id,
      authorId: admin.id,
      title: 'Remote Work Equipment Policy',
      slug: 'remote-work-equipment-policy',
      content: 'Explains which assets (laptop, monitor, peripherals) remote employees are eligible for, and the return process when equipment is retired or reassigned.',
      status: KnowledgeArticleStatus.Published,
      publishedAt: daysAgo(70),
    },
  });
  const licenseRequestArticle = await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: howTo.id,
      authorId: teamLead.id,
      title: 'Requesting New Software Licenses',
      slug: 'requesting-new-software-licenses',
      content: 'Submit an Access Request ticket with the software name and business justification. Manager approval is required for paid seats such as Adobe Creative Cloud.',
      status: KnowledgeArticleStatus.Published,
      publishedAt: daysAgo(25),
    },
  });
  await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: howTo.id,
      authorId: agent2.id,
      title: 'How to Submit a Ticket the Right Way',
      slug: 'how-to-submit-a-ticket-the-right-way',
      content: 'Include the affected asset tag, exact error text, and steps already tried. Tickets with this detail are resolved noticeably faster.',
      status: KnowledgeArticleStatus.Published,
      publishedAt: daysAgo(15),
    },
  });
  await prisma.knowledgeBaseArticle.create({
    data: {
      categoryId: howTo.id,
      authorId: agent1.id,
      title: 'Connecting to the Guest Wi-Fi',
      slug: 'connecting-to-the-guest-wifi',
      content: 'Draft: guest network SSID and voucher process, pending confirmation from facilities before publishing.',
      status: KnowledgeArticleStatus.Draft,
    },
  });

  // ---------------------------------------------------------------------
  // Tickets — a realistic spread of priorities/statuses
  // ---------------------------------------------------------------------

  // Ticket 1: High priority, in progress, agent has responded, within SLA.
  const ticket1 = await prisma.ticket.create({
    data: {
      subject: "Laptop won't turn on",
      description: 'My laptop (asset tag LAPTOP-0001) will not power on this morning. The charging light is off too.',
      requesterId: employee1.id,
      assigneeId: agent1.id,
      categoryId: laptopCategory.id,
      priority: TicketPriority.High,
      status: TicketStatus.InProgress,
      createdAt: hoursAgo(3),
    },
  });
  await prisma.ticketSla.create({
    data: {
      ticketId: ticket1.id,
      slaPolicyId: slaByPriority.High.id,
      responseTargetMinutes: slaByPriority.High.responseTimeMinutes,
      resolutionTargetMinutes: slaByPriority.High.resolutionTimeMinutes,
      responseDueAt: new Date(hoursAgo(3).getTime() + slaByPriority.High.responseTimeMinutes * 60 * 1000),
      responseAt: hoursAgo(2.6),
      resolutionDueAt: new Date(hoursAgo(3).getTime() + slaByPriority.High.resolutionTimeMinutes * 60 * 1000),
    },
  });
  await prisma.ticketHistory.createMany({
    data: [
      { ticketId: ticket1.id, actorId: employee1.id, fieldName: 'status', oldValue: null, newValue: 'New', createdAt: hoursAgo(3) },
      { ticketId: ticket1.id, actorId: teamLead.id, fieldName: 'assignee_id', oldValue: null, newValue: agent1.id, createdAt: hoursAgo(2.8) },
      { ticketId: ticket1.id, actorId: agent1.id, fieldName: 'status', oldValue: 'New', newValue: 'InProgress', createdAt: hoursAgo(2.5) },
    ],
  });
  await prisma.ticketComment.create({
    data: { ticketId: ticket1.id, authorId: employee1.id, body: 'Tried a different power outlet, still nothing.', visibility: CommentVisibility.Public, createdAt: hoursAgo(2.9) },
  });
  await prisma.ticketComment.create({
    data: { ticketId: ticket1.id, authorId: agent1.id, body: 'Likely a dead charger brick — bringing a loaner to swap and test.', visibility: CommentVisibility.Internal, createdAt: hoursAgo(2.4) },
  });
  await prisma.ticketAsset.create({ data: { ticketId: ticket1.id, assetId: laptop1.id, linkedById: agent1.id } });
  await prisma.notification.create({
    data: { recipientId: agent1.id, type: NotificationType.TicketAssigned, title: `Ticket #${ticket1.ticketNumber} assigned to you`, ticketId: ticket1.id, createdAt: hoursAgo(2.8) },
  });

  // Ticket 2: Medium priority, resolved within SLA.
  const ticket2 = await prisma.ticket.create({
    data: {
      subject: 'Need access to Finance shared drive',
      description: 'I was moved to the Finance team last week and still cannot open the shared drive.',
      requesterId: employee2.id,
      assigneeId: agent2.id,
      categoryId: accessRequest.id,
      priority: TicketPriority.Medium,
      status: TicketStatus.Resolved,
      resolvedAt: new Date(daysAgo(5).getTime() + 5 * HOUR),
      createdAt: daysAgo(5),
    },
  });
  await prisma.ticketSla.create({
    data: {
      ticketId: ticket2.id,
      slaPolicyId: slaByPriority.Medium.id,
      responseTargetMinutes: slaByPriority.Medium.responseTimeMinutes,
      resolutionTargetMinutes: slaByPriority.Medium.resolutionTimeMinutes,
      responseDueAt: new Date(daysAgo(5).getTime() + slaByPriority.Medium.responseTimeMinutes * 60 * 1000),
      responseAt: new Date(daysAgo(5).getTime() + 40 * 60 * 1000),
      resolutionDueAt: new Date(daysAgo(5).getTime() + slaByPriority.Medium.resolutionTimeMinutes * 60 * 1000),
      resolutionBreached: false,
    },
  });
  await prisma.ticketHistory.createMany({
    data: [
      { ticketId: ticket2.id, actorId: employee2.id, fieldName: 'status', oldValue: null, newValue: 'New', createdAt: daysAgo(5) },
      { ticketId: ticket2.id, actorId: agent2.id, fieldName: 'status', oldValue: 'New', newValue: 'Resolved', createdAt: new Date(daysAgo(5).getTime() + 5 * HOUR) },
    ],
  });
  await prisma.notification.create({
    data: { recipientId: agent2.id, type: NotificationType.TicketAssigned, title: `Ticket #${ticket2.ticketNumber} assigned to you`, ticketId: ticket2.id, readAt: daysAgo(4), createdAt: daysAgo(5) },
  });

  // Ticket 3: Low priority, brand new, unassigned.
  const ticket3 = await prisma.ticket.create({
    data: {
      subject: 'Outlook keeps crashing',
      description: 'Outlook crashes a few minutes after opening it, every time.',
      requesterId: employee3.id,
      categoryId: businessApps.id,
      priority: TicketPriority.Low,
      status: TicketStatus.New,
      createdAt: hoursAgo(1),
    },
  });
  await prisma.ticketSla.create({
    data: {
      ticketId: ticket3.id,
      slaPolicyId: slaByPriority.Low.id,
      responseTargetMinutes: slaByPriority.Low.responseTimeMinutes,
      resolutionTargetMinutes: slaByPriority.Low.resolutionTimeMinutes,
      responseDueAt: new Date(hoursAgo(1).getTime() + slaByPriority.Low.responseTimeMinutes * 60 * 1000),
      resolutionDueAt: new Date(hoursAgo(1).getTime() + slaByPriority.Low.resolutionTimeMinutes * 60 * 1000),
    },
  });
  await prisma.ticketHistory.create({
    data: { ticketId: ticket3.id, actorId: employee3.id, fieldName: 'status', oldValue: null, newValue: 'New', createdAt: hoursAgo(1) },
  });

  // Ticket 4: Critical priority, on hold, approaching SLA breach.
  const ticket4 = await prisma.ticket.create({
    data: {
      subject: 'VPN drops every 10 minutes',
      description: 'VPN disconnects repeatedly, making remote work almost impossible today.',
      requesterId: employee1.id,
      assigneeId: agent1.id,
      categoryId: network.id,
      priority: TicketPriority.Critical,
      status: TicketStatus.OnHold,
      createdAt: hoursAgo(6),
    },
  });
  await prisma.ticketSla.create({
    data: {
      ticketId: ticket4.id,
      slaPolicyId: slaByPriority.Critical.id,
      responseTargetMinutes: slaByPriority.Critical.responseTimeMinutes,
      resolutionTargetMinutes: slaByPriority.Critical.resolutionTimeMinutes,
      responseDueAt: new Date(hoursAgo(6).getTime() + slaByPriority.Critical.responseTimeMinutes * 60 * 1000),
      responseAt: hoursAgo(5.8),
      resolutionDueAt: new Date(hoursAgo(6).getTime() + slaByPriority.Critical.resolutionTimeMinutes * 60 * 1000),
      resolutionBreached: true,
      onHoldStartedAt: hoursAgo(1),
      totalPausedMinutes: 0,
    },
  });
  await prisma.ticketHistory.createMany({
    data: [
      { ticketId: ticket4.id, actorId: employee1.id, fieldName: 'status', oldValue: null, newValue: 'New', createdAt: hoursAgo(6) },
      { ticketId: ticket4.id, actorId: agent1.id, fieldName: 'status', oldValue: 'New', newValue: 'InProgress', createdAt: hoursAgo(5.8) },
      { ticketId: ticket4.id, actorId: agent1.id, fieldName: 'status', oldValue: 'InProgress', newValue: 'OnHold', createdAt: hoursAgo(1) },
    ],
  });
  await prisma.ticketKnowledgeArticle.create({ data: { ticketId: ticket4.id, articleId: vpnArticle.id, linkedById: agent1.id } });
  await prisma.notification.create({
    data: { recipientId: agent1.id, type: NotificationType.SLABreached, title: `Ticket #${ticket4.ticketNumber} has breached its resolution SLA`, ticketId: ticket4.id, createdAt: hoursAgo(1) },
  });

  // Ticket 5: reopened ticket — demonstrates reopened_count and history, per
  // the Phase 2 decision that reopening does NOT create a new SLA cycle.
  const ticket5 = await prisma.ticket.create({
    data: {
      subject: 'Printer not working',
      description: 'The 3rd floor printer is jammed and now shows an error code.',
      requesterId: employee2.id,
      assigneeId: agent2.id,
      categoryId: hardware.id,
      priority: TicketPriority.Medium,
      status: TicketStatus.Open,
      reopenedCount: 1,
      createdAt: daysAgo(10),
    },
  });
  await prisma.ticketSla.create({
    data: {
      ticketId: ticket5.id,
      slaPolicyId: slaByPriority.Medium.id,
      responseTargetMinutes: slaByPriority.Medium.responseTimeMinutes,
      resolutionTargetMinutes: slaByPriority.Medium.resolutionTimeMinutes,
      responseDueAt: new Date(daysAgo(10).getTime() + slaByPriority.Medium.responseTimeMinutes * 60 * 1000),
      responseAt: new Date(daysAgo(10).getTime() + 20 * 60 * 1000),
      resolutionDueAt: new Date(daysAgo(10).getTime() + slaByPriority.Medium.resolutionTimeMinutes * 60 * 1000),
      resolutionBreached: true,
    },
  });
  await prisma.ticketHistory.createMany({
    data: [
      { ticketId: ticket5.id, actorId: employee2.id, fieldName: 'status', oldValue: null, newValue: 'New', createdAt: daysAgo(10) },
      { ticketId: ticket5.id, actorId: agent2.id, fieldName: 'status', oldValue: 'New', newValue: 'InProgress', createdAt: daysAgo(9) },
      { ticketId: ticket5.id, actorId: agent2.id, fieldName: 'status', oldValue: 'InProgress', newValue: 'Resolved', createdAt: daysAgo(8) },
      { ticketId: ticket5.id, actorId: employee2.id, fieldName: 'status', oldValue: 'Resolved', newValue: 'Open', createdAt: daysAgo(1) },
      { ticketId: ticket5.id, actorId: employee2.id, fieldName: 'reopened_count', oldValue: '0', newValue: '1', createdAt: daysAgo(1) },
    ],
  });
  await prisma.ticketComment.create({
    data: { ticketId: ticket5.id, authorId: employee2.id, body: 'This jammed again in the exact same spot — reopening.', visibility: CommentVisibility.Public, createdAt: daysAgo(1) },
  });

  // ---------------------------------------------------------------------
  // Generated tickets — ~48 additional, index-driven (deterministic, not
  // Math.random()) so a re-run of this seed always yields the same data.
  // This is what gives Analytics/SLA/Tickets pages a believable volume and
  // date spread instead of five hand-typed rows.
  // ---------------------------------------------------------------------
  type GeneratedTemplate = {
    subject: string;
    description: string;
    category: { id: string };
    priority: TicketPriority;
  };

  const generatedTemplates: GeneratedTemplate[] = [
    { subject: "VPN client won't connect after Windows update", description: 'Since the latest Windows update, the corporate VPN client fails to connect with a generic error.', category: network, priority: TicketPriority.High },
    { subject: 'Need admin rights to install Figma', description: 'Design team member needs local admin rights to install and update Figma desktop app.', category: businessApps, priority: TicketPriority.Medium },
    { subject: 'New hire onboarding — accounts and equipment', description: 'New employee starts Monday and needs accounts provisioned plus a laptop and monitor ready.', category: accessRequest, priority: TicketPriority.Medium },
    { subject: 'Monitor flickering intermittently', description: 'External monitor flickers a few times an hour, especially under fluorescent lighting.', category: desktopCategory, priority: TicketPriority.Low },
    { subject: "Can't print to 3rd floor printer", description: 'Print jobs sent to the 3rd floor printer sit in the queue and never print.', category: hardware, priority: TicketPriority.Low },
    { subject: 'Outlook rules not syncing across devices', description: 'Inbox rules created on desktop Outlook do not show up on the mobile app.', category: businessApps, priority: TicketPriority.Medium },
    { subject: 'Laptop fan making loud grinding noise', description: 'Fan noise has gotten progressively louder over the past week, especially under load.', category: laptopCategory, priority: TicketPriority.Medium },
    { subject: 'Password reset for locked account', description: 'Account locked out after too many failed login attempts, needs a reset.', category: accessRequest, priority: TicketPriority.High },
    { subject: 'Slack notifications not showing on desktop', description: 'Desktop notifications for Slack stopped appearing after the last app update.', category: businessApps, priority: TicketPriority.Low },
    { subject: 'Wi-Fi drops in conference room B', description: 'Wi-Fi disconnects every few minutes specifically in conference room B, other rooms are fine.', category: network, priority: TicketPriority.Medium },
    { subject: 'Blue screen error on startup', description: 'Desktop shows a blue screen with a memory management error on every boot.', category: desktopCategory, priority: TicketPriority.Critical },
    { subject: 'Need access to shared Marketing drive', description: 'Recently transferred to Marketing and cannot open the shared department drive.', category: accessRequest, priority: TicketPriority.Medium },
    { subject: 'Windows update stuck at 40%', description: 'Windows update has been stuck at 40 percent for over an hour, machine will not restart cleanly.', category: operatingSystem, priority: TicketPriority.Medium },
    { subject: 'External monitor not detected', description: 'Docking station is connected but the external monitor is not detected by the laptop.', category: hardware, priority: TicketPriority.Low },
    { subject: 'Zoom camera not working', description: 'Camera shows a black screen in Zoom calls even though it works in other apps.', category: businessApps, priority: TicketPriority.Low },
    { subject: 'Phone not receiving calls', description: 'Company mobile stopped receiving inbound calls since yesterday, texts still work.', category: hardware, priority: TicketPriority.Medium },
    { subject: 'Email bouncing to external clients', description: 'Emails to several external clients are bouncing back with a delivery failure notice.', category: network, priority: TicketPriority.High },
    { subject: 'Request for a second monitor', description: 'Would like a second monitor added to the current desk setup for a new role.', category: accessRequest, priority: TicketPriority.Low },
    { subject: 'Keyboard keys sticking', description: 'The spacebar and E key stick intermittently on the laptop keyboard.', category: laptopCategory, priority: TicketPriority.Low },
    { subject: 'VPN certificate expired', description: 'VPN client shows a certificate expired error and refuses to connect.', category: network, priority: TicketPriority.High },
    { subject: 'Software license expired — Adobe Creative Cloud', description: 'Adobe Creative Cloud shows the license as expired even though it should still be active.', category: businessApps, priority: TicketPriority.Medium },
    { subject: 'Laptop overheating during video calls', description: 'Laptop gets very hot and throttles noticeably during long video calls.', category: laptopCategory, priority: TicketPriority.Medium },
    { subject: 'Cannot access payroll system', description: 'Payroll portal returns an access denied error since this morning.', category: accessRequest, priority: TicketPriority.High },
    { subject: "Desktop won't boot past BIOS screen", description: 'Desktop hangs on the manufacturer logo screen and never reaches Windows.', category: desktopCategory, priority: TicketPriority.Critical },
    { subject: 'Request elevated permissions for deployment', description: 'Engineer needs elevated permissions on the deployment server for an upcoming release.', category: accessRequest, priority: TicketPriority.High },
    { subject: 'Battery draining extremely fast', description: 'Laptop battery drops from full to empty in under two hours even when idle.', category: laptopCategory, priority: TicketPriority.Medium },
    { subject: 'Teams calls dropping mid-meeting', description: 'Microsoft Teams calls disconnect abruptly a few minutes into most meetings.', category: businessApps, priority: TicketPriority.Medium },
    { subject: 'Guest Wi-Fi not working for visitors', description: 'Visitors cannot connect to the guest Wi-Fi network, the voucher page never loads.', category: network, priority: TicketPriority.Low },
    { subject: 'New employee needs laptop provisioned', description: 'Laptop needs to be imaged and provisioned ahead of a start date next week.', category: accessRequest, priority: TicketPriority.Medium },
    { subject: 'Excel crashing when opening large files', description: 'Excel crashes consistently when opening the shared finance workbook.', category: businessApps, priority: TicketPriority.Medium },
    { subject: 'Printer toner low, need replacement', description: '2nd floor printer is showing a low toner warning and needs a replacement cartridge.', category: hardware, priority: TicketPriority.Low },
    { subject: 'Suspicious phishing email reported', description: 'Received an email impersonating IT asking to confirm a password — reporting as phishing.', category: network, priority: TicketPriority.Critical },
    { subject: 'Cannot connect to company VPN from home', description: 'VPN client times out every attempt to connect from home network, worked fine last week.', category: network, priority: TicketPriority.High },
    { subject: 'Software installation blocked by policy', description: 'Attempting to install a required tool triggers a group policy block.', category: operatingSystem, priority: TicketPriority.Medium },
    { subject: 'Docking station not charging laptop', description: 'Laptop no longer charges through the docking station, only via the direct charger.', category: laptopCategory, priority: TicketPriority.Medium },
    { subject: 'Request access to Salesforce', description: 'New sales rep needs a Salesforce account with standard sales-rep permissions.', category: accessRequest, priority: TicketPriority.Medium },
    { subject: 'Screen resolution reset after every reboot', description: 'Display resolution reverts to a low default every time the desktop restarts.', category: desktopCategory, priority: TicketPriority.Low },
    { subject: 'Shared calendar not syncing', description: 'Team shared calendar shows different events depending on which device is used.', category: businessApps, priority: TicketPriority.Low },
    { subject: 'Two-factor authentication codes not arriving', description: 'SMS codes for two-factor login are not arriving, blocking sign-in entirely.', category: accessRequest, priority: TicketPriority.High },
    { subject: 'Laptop screen cracked after drop', description: 'Laptop was dropped and the screen now has a visible crack across the display.', category: laptopCategory, priority: TicketPriority.High },
    { subject: 'OS update caused audio driver failure', description: 'No audio output on the desktop since the latest OS update installed.', category: operatingSystem, priority: TicketPriority.Medium },
    { subject: 'Network drive mapping lost after reboot', description: 'Mapped network drives disappear every time the machine is restarted.', category: network, priority: TicketPriority.Medium },
    { subject: 'Request temporary contractor account', description: 'Contractor starting a two-week engagement needs a temporary scoped account.', category: accessRequest, priority: TicketPriority.Medium },
    { subject: 'Desktop fans running at full speed constantly', description: 'Desktop fans run at full speed even at idle, unusually loud compared to before.', category: desktopCategory, priority: TicketPriority.Medium },
    { subject: 'Spam filter blocking legitimate emails', description: 'Several legitimate vendor emails are being routed to spam and missed.', category: network, priority: TicketPriority.Medium },
    { subject: 'Need software license reassigned from departed employee', description: 'A departed employee still holds a paid software seat that should be reassigned.', category: businessApps, priority: TicketPriority.Low },
    { subject: "Conference room display won't connect via HDMI", description: 'Laptops cannot get the conference room display to detect an HDMI signal.', category: hardware, priority: TicketPriority.Low },
    { subject: 'Old laptop retirement and data migration', description: 'Old laptop is being replaced and needs local files migrated before retirement.', category: laptopCategory, priority: TicketPriority.Medium },
  ];

  type Scenario = {
    status: TicketStatus;
    shape:
      | 'unstarted'
      | 'onTrackResponded'
      | 'inFlightBreach'
      | 'inFlightBreachNeverResponded'
      | 'completedOnTimeShort'
      | 'completedOnTimeLong'
      | 'completedOnTimeMedium'
      | 'completedBreach'
      | 'completedBreachClosed'
      | 'respondedLateCompleted';
  };

  const scenarios: Scenario[] = [
    { status: TicketStatus.New, shape: 'unstarted' },
    { status: TicketStatus.Open, shape: 'onTrackResponded' },
    { status: TicketStatus.InProgress, shape: 'onTrackResponded' },
    { status: TicketStatus.OnHold, shape: 'onTrackResponded' },
    { status: TicketStatus.InProgress, shape: 'inFlightBreach' },
    { status: TicketStatus.New, shape: 'inFlightBreachNeverResponded' },
    { status: TicketStatus.Resolved, shape: 'completedOnTimeShort' },
    { status: TicketStatus.Resolved, shape: 'completedOnTimeLong' },
    { status: TicketStatus.Closed, shape: 'completedOnTimeMedium' },
    { status: TicketStatus.Resolved, shape: 'completedBreach' },
    { status: TicketStatus.Closed, shape: 'completedBreachClosed' },
    { status: TicketStatus.Closed, shape: 'respondedLateCompleted' },
  ];

  const requesterPool = [employee1, employee2, employee3];
  const agentPool = [agent1, agent2];
  const linkAssets = [laptop2, monitor3, desktop3, phone2, peripheral1, license1, laptop5];
  const linkArticles = [printerArticle, remoteEquipmentArticle, licenseRequestArticle, vpnArticle];

  const generatedTickets: { id: string; ticketNumber: number; status: TicketStatus }[] = [];

  for (let i = 0; i < generatedTemplates.length; i++) {
    const template = generatedTemplates[i];
    const scenario = scenarios[i % scenarios.length];
    const resolvedLikeStatuses: TicketStatus[] = [TicketStatus.Resolved, TicketStatus.Closed];
    const unresolved = !resolvedLikeStatuses.includes(scenario.status);
    const rawAgeDays = 1 + ((i * 13) % 59);
    const ageDays = unresolved ? 1 + (rawAgeDays % 21) : rawAgeDays;
    const createdAt = daysAgo(ageDays);
    const createdMs = createdAt.getTime();

    const policy = slaByPriority[template.priority];
    const responseTargetMinutes = policy.responseTimeMinutes;
    const resolutionTargetMinutes = policy.resolutionTimeMinutes;
    const responseDueAt = new Date(createdMs + responseTargetMinutes * 60 * 1000);
    const resolutionDueAt = new Date(createdMs + resolutionTargetMinutes * 60 * 1000);

    const requester = requesterPool[i % requesterPool.length];
    const isUnassignedNew = scenario.status === TicketStatus.New && i % 3 === 0;
    const assignee = isUnassignedNew ? undefined : agentPool[i % agentPool.length];

    let responseAt: Date | undefined;
    let responseBreached = false;
    let resolutionBreached = false;
    let resolvedAt: Date | undefined;
    let closedAt: Date | undefined;
    let onHoldStartedAt: Date | undefined;

    switch (scenario.shape) {
      case 'unstarted':
        break;
      case 'onTrackResponded':
        responseAt = new Date(createdMs + responseTargetMinutes * 0.3 * 60 * 1000);
        if (scenario.status === TicketStatus.OnHold) {
          onHoldStartedAt = new Date(createdMs + 2 * HOUR);
        }
        break;
      case 'inFlightBreach':
        responseAt = new Date(createdMs + responseTargetMinutes * 0.5 * 60 * 1000);
        resolutionBreached = true;
        break;
      case 'inFlightBreachNeverResponded':
        responseBreached = true;
        resolutionBreached = true;
        break;
      case 'completedOnTimeShort':
        responseAt = new Date(createdMs + responseTargetMinutes * 0.3 * 60 * 1000);
        resolvedAt = new Date(createdMs + resolutionTargetMinutes * 0.4 * 60 * 1000);
        break;
      case 'completedOnTimeLong':
        responseAt = new Date(createdMs + responseTargetMinutes * 0.6 * 60 * 1000);
        resolvedAt = new Date(createdMs + resolutionTargetMinutes * 0.9 * 60 * 1000);
        break;
      case 'completedOnTimeMedium':
        responseAt = new Date(createdMs + responseTargetMinutes * 0.4 * 60 * 1000);
        resolvedAt = new Date(createdMs + resolutionTargetMinutes * 0.6 * 60 * 1000);
        closedAt = new Date(resolvedAt.getTime() + 4 * HOUR);
        break;
      case 'completedBreach':
        responseAt = new Date(createdMs + responseTargetMinutes * 0.4 * 60 * 1000);
        resolvedAt = new Date(createdMs + resolutionTargetMinutes * 1.8 * 60 * 1000);
        resolutionBreached = true;
        break;
      case 'completedBreachClosed':
        responseAt = new Date(createdMs + responseTargetMinutes * 0.4 * 60 * 1000);
        resolvedAt = new Date(createdMs + resolutionTargetMinutes * 2.2 * 60 * 1000);
        resolutionBreached = true;
        closedAt = new Date(resolvedAt.getTime() + 3 * HOUR);
        break;
      case 'respondedLateCompleted':
        responseAt = new Date(createdMs + responseTargetMinutes * 2.5 * 60 * 1000);
        responseBreached = true;
        resolvedAt = new Date(createdMs + resolutionTargetMinutes * 1.1 * 60 * 1000);
        resolutionBreached = true;
        closedAt = new Date(resolvedAt.getTime() + 2 * HOUR);
        break;
    }

    const ticket = await prisma.ticket.create({
      data: {
        subject: template.subject,
        description: template.description,
        requesterId: requester.id,
        assigneeId: assignee?.id,
        categoryId: template.category.id,
        priority: template.priority,
        status: scenario.status,
        createdAt,
        resolvedAt,
        closedAt,
      },
    });
    generatedTickets.push({ id: ticket.id, ticketNumber: ticket.ticketNumber, status: ticket.status });

    await prisma.ticketSla.create({
      data: {
        ticketId: ticket.id,
        slaPolicyId: policy.id,
        responseTargetMinutes,
        resolutionTargetMinutes,
        responseDueAt,
        responseAt,
        responseBreached,
        resolutionDueAt,
        resolutionBreached,
        onHoldStartedAt,
      },
    });

    // A minority get an explicit creation/status history row.
    if (i % 3 === 0) {
      await prisma.ticketHistory.create({
        data: { ticketId: ticket.id, actorId: requester.id, fieldName: 'status', oldValue: null, newValue: 'New', createdAt },
      });
      if (scenario.status !== TicketStatus.New) {
        await prisma.ticketHistory.create({
          data: {
            ticketId: ticket.id,
            actorId: assignee?.id ?? teamLead.id,
            fieldName: 'status',
            oldValue: 'New',
            newValue: scenario.status,
            createdAt: resolvedAt ?? new Date(createdMs + 3 * HOUR),
          },
        });
      }
    }

    // A minority get a public comment so ticket detail pages aren't empty.
    if (i % 4 === 0) {
      await prisma.ticketComment.create({
        data: {
          ticketId: ticket.id,
          authorId: requester.id,
          body: 'Following up — please let me know if you need anything else from my side.',
          visibility: CommentVisibility.Public,
          createdAt: new Date(createdMs + 1 * HOUR),
        },
      });
    }

    // A minority link to an existing asset or KB article.
    if (i % 7 === 0) {
      const asset = linkAssets[Math.floor(i / 7) % linkAssets.length];
      await prisma.ticketAsset.create({ data: { ticketId: ticket.id, assetId: asset.id, linkedById: assignee?.id ?? teamLead.id } });
    }
    if (i % 9 === 0) {
      const article = linkArticles[Math.floor(i / 9) % linkArticles.length];
      await prisma.ticketKnowledgeArticle.create({ data: { ticketId: ticket.id, articleId: article.id, linkedById: assignee?.id ?? teamLead.id } });
    }
  }

  const inFlightBreachedCount = generatedTickets.filter(
    (t, i) => scenarios[i % scenarios.length].shape === 'inFlightBreach' || scenarios[i % scenarios.length].shape === 'inFlightBreachNeverResponded',
  ).length;

  console.log('Seed complete:', {
    users: 7,
    ticketCategories: 8,
    assetTypes: 6,
    assets: 20,
    slaPolicies: 4,
    knowledgeBaseArticles: 11,
    tickets: 5 + generatedTickets.length,
    generatedInFlightBreachedTickets: inFlightBreachedCount,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
