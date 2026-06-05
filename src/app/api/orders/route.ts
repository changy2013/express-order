import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { Order } from '@/types';

export const runtime = 'nodejs';

// Generate tracking numbers like JT260605xxxxxx
function generateOrderNo(): string {
  const dateStr = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const rand = Math.floor(100000 + Math.random() * 900000); // 6-digit random
  return `JT${dateStr}${rand}`;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type');
    const batchId = searchParams.get('batchId');

    // Case 1: Fetch all import batches for statistics/history logs
    if (type === 'batches') {
      const result = await query('SELECT * FROM import_batches');
      return NextResponse.json({ batches: result.rows });
    }

    // Case 2: Fetch orders, optionally filtered by batch_id
    let result;
    if (batchId) {
      result = await query('SELECT * FROM orders WHERE batch_id = $1', [batchId]);
    } else {
      result = await query('SELECT * FROM orders');
    }

    return NextResponse.json({ orders: result.rows });
  } catch (error: any) {
    console.error('Fetch orders/batches failed:', error);
    return NextResponse.json({ error: error.message || '内部服务错误' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { orders, batchId } = body as { orders: Omit<Order, 'id' | 'order_no' | 'status'>[]; batchId?: string };

    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: '没有提供可提交的订单数据' }, { status: 400 });
    }

    console.log(`正在导入 ${orders.length} 条订单到数据库...`);
    const insertedOrders: Order[] = [];

    // Process each order
    for (const order of orders) {
      const orderId = crypto.randomUUID();
      const orderNo = generateOrderNo();
      
      const params = [
        orderId,
        batchId || null,
        orderNo,
        order.sender_name || '',
        order.sender_phone || '',
        order.sender_address || '',
        order.receiver_name || '',
        order.receiver_phone || '',
        order.receiver_address || '',
        order.goods_name || '包裹',
        Number(order.quantity) || 1,
        Number(order.weight) || 1.0,
        Number(order.volume) || 0.01,
        order.remark || '',
        'pending' // Status becomes 'pending' (待发送) once confirmed
      ];

      await query(
        `INSERT INTO orders(
          id, batch_id, order_no, 
          sender_name, sender_phone, sender_address, 
          receiver_name, receiver_phone, receiver_address, 
          goods_name, quantity, weight, volume, remark, status
        ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        params
      );

      insertedOrders.push({
        id: orderId,
        batch_id: batchId,
        order_no: orderNo,
        ...order,
        status: 'pending'
      });
    }

    // If batchId is provided, update the status of the batch to 'success' in database
    if (batchId) {
      await query(
        'UPDATE import_batches SET status = $1, order_count = $2 WHERE id = $3',
        ['success', orders.length, batchId]
      );
    }

    return NextResponse.json({ 
      success: true, 
      count: insertedOrders.length,
      orders: insertedOrders
    });

  } catch (error: any) {
    console.error('Submit orders failed:', error);
    return NextResponse.json({ error: error.message || '导入订单失败' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get('id');

    if (!orderId) {
      return NextResponse.json({ error: '缺少订单 ID' }, { status: 400 });
    }

    await query('DELETE FROM orders WHERE id = $1', [orderId]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete order failed:', error);
    return NextResponse.json({ error: error.message || '删除订单失败' }, { status: 500 });
  }
}
