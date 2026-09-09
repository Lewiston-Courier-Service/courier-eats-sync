import { createTrackingToken } from "./tracking-token.js";
import { createDriverToken } from "./driver-token.js";

function json(d,s=200){return new Response(JSON.stringify(d,null,2),{status:s,headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}})}
function clean(v){return String(v??"").trim()}
function ok(request,env){return Boolean(clean(env.ADMIN_API_KEY)&&clean(request.headers.get("x-admin-key"))===clean(env.ADMIN_API_KEY))}
const STATUSES=new Set(["NEW","ACCEPTED","ASSIGNED","EN_ROUTE_TO_PICKUP","PICKED_UP","EN_ROUTE_TO_CUSTOMER","DELIVERED","CANCELLED"]);
const SELECT=`SELECT o.*,d.name AS driver_name,d.phone AS driver_phone FROM dispatch_orders o LEFT JOIN drivers d ON d.id=o.assigned_driver_id`;

export async function handleTmsAdmin(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith("/api/tms/")) return null;
  if(!env.DISPATCH_DB) return json({error:"Dispatch database is not bound"},500);
  if(!ok(request,env)) return json({error:"Unauthorized"},401);

  if(url.pathname==="/api/tms/drivers"&&request.method==="GET"){
    const r=await env.DISPATCH_DB.prepare("SELECT id,name,phone,status,created_at FROM drivers ORDER BY CASE WHEN status='AVAILABLE' THEN 0 ELSE 1 END,name").all();
    return json({success:true,service:"LCS TMS",drivers:r.results||[]});
  }

  let dm=url.pathname.match(/^\/api\/tms\/drivers\/(\d+)\/app-link$/);
  if(dm&&request.method==="GET"){
    const driverId=Number(dm[1]);
    const driver=await env.DISPATCH_DB.prepare("SELECT id,name FROM drivers WHERE id=?").bind(driverId).first();
    if(!driver)return json({error:"Driver not found"},404);
    const token=await createDriverToken(driverId,env);
    return json({
      success:true,
      service:"LCS TMS",
      driverId,
      driverName:driver.name,
      driverAppUrl:`${url.origin}/driver/?token=${encodeURIComponent(token)}`
    });
  }

  if(url.pathname==="/api/tms/orders"&&request.method==="GET"){
    const status=clean(url.searchParams.get("status")).toUpperCase();
    const lim=Math.max(1,Math.min(Number(url.searchParams.get("limit")||100)||100,250));
    let sql=SELECT,bind=[];
    if(status){sql+=" WHERE o.status=?";bind.push(status)}
    sql+=" ORDER BY o.id DESC LIMIT ?";bind.push(lim);
    const r=await env.DISPATCH_DB.prepare(sql).bind(...bind).all();
    return json({success:true,service:"LCS TMS",orders:r.results||[]});
  }

  let m=url.pathname.match(/^\/api\/tms\/orders\/(\d+)\/tracking-link$/);
  if(m&&request.method==="GET"){
    const id=Number(m[1]);
    const order=await env.DISPATCH_DB.prepare("SELECT id FROM dispatch_orders WHERE id=?").bind(id).first();
    if(!order)return json({error:"Dispatch order not found"},404);
    const token=await createTrackingToken(id,env);
    return json({success:true,service:"LCS TMS",dispatchOrderId:id,trackingUrl:`${url.origin}/track/?token=${encodeURIComponent(token)}`});
  }

  m=url.pathname.match(/^\/api\/tms\/orders\/(\d+)\/assign$/);
  if(m&&(request.method==="PATCH"||request.method==="POST")){
    const id=Number(m[1]);let body;
    try{body=await request.json()}catch{return json({error:"Invalid JSON body"},400)}
    const driverId=Number(body.driverId);
    if(!Number.isInteger(driverId)||driverId<1)return json({error:"A valid driverId is required"},400);
    const order=await env.DISPATCH_DB.prepare("SELECT id,assigned_driver_id,status FROM dispatch_orders WHERE id=?").bind(id).first();
    if(!order)return json({error:"Dispatch order not found"},404);
    const driver=await env.DISPATCH_DB.prepare("SELECT id,name,phone,status FROM drivers WHERE id=?").bind(driverId).first();
    if(!driver)return json({error:"Driver not found"},404);

    if(Number(order.assigned_driver_id)===driverId){
      return json({success:true,service:"LCS TMS",dispatchOrderId:id,status:order.status,duplicate:true,message:`${driver.name} is already assigned to this dispatch`,driver});
    }

    if(order.assigned_driver_id&&Number(order.assigned_driver_id)!==driverId){
      await env.DISPATCH_DB.prepare("UPDATE drivers SET status='AVAILABLE' WHERE id=?").bind(order.assigned_driver_id).run();
    }
    await env.DISPATCH_DB.prepare("UPDATE dispatch_orders SET assigned_driver_id=?,status='ASSIGNED',updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(driverId,id).run();
    await env.DISPATCH_DB.prepare("UPDATE drivers SET status='BUSY' WHERE id=?").bind(driverId).run();
    await env.DISPATCH_DB.prepare("INSERT INTO dispatch_events (order_id,status,note) VALUES (?,'ASSIGNED',?)").bind(id,`Assigned to driver ${driver.name}`).run();
    return json({success:true,service:"LCS TMS",dispatchOrderId:id,status:"ASSIGNED",driver});
  }

  m=url.pathname.match(/^\/api\/tms\/orders\/(\d+)\/status$/);
  if(m&&(request.method==="PATCH"||request.method==="POST")){
    const id=Number(m[1]);let body;
    try{body=await request.json()}catch{return json({error:"Invalid JSON body"},400)}
    const status=clean(body.status).toUpperCase(),note=clean(body.note);
    if(!STATUSES.has(status))return json({error:"Invalid status",allowedStatuses:[...STATUSES]},400);
    const order=await env.DISPATCH_DB.prepare("SELECT id,status,assigned_driver_id FROM dispatch_orders WHERE id=?").bind(id).first();
    if(!order)return json({error:"Dispatch order not found"},404);
    await env.DISPATCH_DB.prepare("UPDATE dispatch_orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(status,id).run();
    await env.DISPATCH_DB.prepare("INSERT INTO dispatch_events (order_id,status,note) VALUES (?,?,?)").bind(id,status,note||`Status changed from ${order.status} to ${status}`).run();
    if(order.assigned_driver_id&&(status==="DELIVERED"||status==="CANCELLED")){
      await env.DISPATCH_DB.prepare("UPDATE drivers SET status='AVAILABLE' WHERE id=?").bind(order.assigned_driver_id).run();
    }
    return json({success:true,service:"LCS TMS",dispatchOrderId:id,previousStatus:order.status,status});
  }

  m=url.pathname.match(/^\/api\/tms\/orders\/(\d+)$/);
  if(m&&request.method==="GET"){
    const id=Number(m[1]);
    const order=await env.DISPATCH_DB.prepare(SELECT+" WHERE o.id=?").bind(id).first();
    if(!order)return json({error:"Dispatch order not found"},404);
    const e=await env.DISPATCH_DB.prepare("SELECT * FROM dispatch_events WHERE order_id=? ORDER BY id DESC").bind(id).all();
    return json({success:true,service:"LCS TMS",order,events:e.results||[]});
  }

  return json({error:"TMS route not found"},404);
}
