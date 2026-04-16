'use client';

import { useMemo } from 'react';

interface Item {
  id: string;
  barcode: string;
  product_type: string | null;
  brand: string | null;
  status: string | null;
  condition: string | null;
  location_status: string | null;
  problems: string[] | null;
  shop: string | null;
  photo_url: string | null;
  needs_jurf: boolean;
  date_received: string | null;
  date_sent_to_jurf: string | null;
  tested_by: string | null;
  repair_notes: string | null;
  repair_cost: number | null;
  destination_shop: string | null;
  created_by: string | null;
  created_at: string;
  approval_status: string | null;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function useManagerData(
  allItems: Item[],
  shopFilter: string,
  statusFilter: string,
  dateFilter: string,
  listTab: 'approved' | 'rejected'
) {
  // Split by approval status
  const pending = useMemo(() => allItems.filter((i) => i.approval_status === 'pending'), [allItems]);
  const approved = useMemo(
    () => allItems.filter((i) => i.approval_status !== 'pending' && i.approval_status !== 'rejected'),
    [allItems]
  );
  const rejected = useMemo(() => allItems.filter((i) => i.approval_status === 'rejected'), [allItems]);

  // Overdue items (location_status = sent_to_jurf for >24h)
  const overdueItems = useMemo(() => {
    return approved.filter((i) => {
      if (i.location_status !== 'sent_to_jurf' || !i.date_sent_to_jurf) return false;
      return Date.now() - new Date(i.date_sent_to_jurf).getTime() > 24 * 60 * 60 * 1000;
    });
  }, [approved]);

  // Shop counts (at_shop only)
  const shopCounts: Record<string, number> = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of approved) {
      if (item.location_status === 'at_shop' && item.shop) {
        counts[item.shop] = (counts[item.shop] || 0) + 1;
      }
    }
    return counts;
  }, [approved]);
  const maxShopCount = Math.max(...Object.values(shopCounts), 1);

  // Pipeline metrics
  const metrics = useMemo(() => {
    const totalActive = approved.filter((i) => i.condition !== 'scrap' && i.location_status !== 'delivered').length;
    const inRepair = approved.filter((i) => i.location_status === 'at_jurf' || i.location_status === 'in_repair').length;
    const readyToShip = approved.filter((i) => i.condition === 'repaired' && i.location_status !== 'delivered').length;
    const delivered = approved.filter((i) => i.location_status === 'delivered').length;
    const working = approved.filter((i) => i.condition === 'working').length;
    const notWorking = approved.filter((i) => i.condition === 'not_working').length;
    const pendingScrap = approved.filter((i) => i.condition === 'pending_scrap').length;
    const scrap = approved.filter((i) => i.condition === 'scrap').length;
    return { totalActive, inRepair, readyToShip, delivered, working, notWorking, pendingScrap, scrap };
  }, [approved]);

  // Trends (today vs yesterday by date_received)
  const trends = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const isToday = (d: string | null) => d && new Date(d) >= today;
    const isYesterday = (d: string | null) => d && new Date(d) >= yesterday && new Date(d) < today;

    const todayItems = approved.filter((i) => isToday(i.date_received));
    const yesterdayItems = approved.filter((i) => isYesterday(i.date_received));

    const todayCount = todayItems.length;
    const yesterdayCount = yesterdayItems.length;
    const intakeDelta = todayCount - yesterdayCount;

    return { todayCount, yesterdayCount, intakeDelta };
  }, [approved]);

  // Repair cost metrics
  const costMetrics = useMemo(() => {
    const itemsWithCost = approved.filter((i) => i.repair_cost && i.repair_cost > 0);
    const totalCost = itemsWithCost.reduce((sum, i) => sum + (i.repair_cost || 0), 0);
    const avgCost = itemsWithCost.length > 0 ? totalCost / itemsWithCost.length : 0;
    const sorted = [...itemsWithCost].sort((a, b) => (b.repair_cost || 0) - (a.repair_cost || 0));
    const mostExpensive = sorted[0] || null;
    return { totalCost, avgCost, mostExpensive, count: itemsWithCost.length };
  }, [approved]);

  // Intake velocity (last 7 days)
  const intakeVelocity = useMemo(() => {
    const days: { date: Date; dayName: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      const nextD = new Date(d);
      nextD.setDate(nextD.getDate() + 1);
      const count = allItems.filter((item) => {
        if (!item.date_received) return false;
        const rd = new Date(item.date_received);
        return rd >= d && rd < nextD;
      }).length;
      days.push({ date: d, dayName: DAY_NAMES[d.getDay()], count });
    }
    return days;
  }, [allItems]);
  const maxIntake = Math.max(...intakeVelocity.map((d) => d.count), 1);

  // Filter items for the list (approved or rejected based on tab)
  const listItems = listTab === 'rejected' ? rejected : approved;
  const filtered = useMemo(() => {
    let items = [...listItems];
    if (shopFilter !== 'All') items = items.filter((i) => i.shop === shopFilter);
    const conditionFilterMap: Record<string, string> = {
      Working: 'working',
      'Not Working': 'not_working',
      'Pending Scrap': 'pending_scrap',
      Repaired: 'repaired',
    };
    if (statusFilter === 'In Transit') items = items.filter((i) => i.location_status === 'sent_to_jurf');
    else if (statusFilter === 'At Jurf') items = items.filter((i) => i.location_status === 'at_jurf');
    else if (statusFilter === 'Delivered') items = items.filter((i) => i.location_status === 'delivered');
    else if (statusFilter !== 'All') {
      const cond = conditionFilterMap[statusFilter];
      if (cond) items = items.filter((i) => i.condition === cond);
    }
    if (dateFilter !== 'All Time') {
      const now = new Date();
      let cutoff: Date;
      if (dateFilter === 'Today') cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      else if (dateFilter === 'This Week') cutoff = new Date(now.getTime() - 7 * 86400000);
      else cutoff = new Date(now.getFullYear(), now.getMonth(), 1);
      items = items.filter((i) => new Date(i.created_at) >= cutoff);
    }
    return items;
  }, [listItems, shopFilter, statusFilter, dateFilter]);

  return {
    pending,
    approved,
    rejected,
    overdueItems,
    shopCounts,
    maxShopCount,
    metrics,
    trends,
    costMetrics,
    intakeVelocity,
    maxIntake,
    filtered,
  };
}
