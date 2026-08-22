import { hashPassword } from './auth.js'

export async function seedIfEmpty(pool) {
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@smartlandlord.local').toLowerCase()
  const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe!2026'
  const existing = await pool.query('SELECT count(*)::int AS count FROM users')
  if (!existing.rows[0].count) {
    await pool.query(
      `INSERT INTO users(email,name,password_hash,role,phone) VALUES($1,$2,$3,'admin','07700 900000')`,
      [adminEmail, 'System Administrator', hashPassword(adminPassword)]
    )
  }

  if (process.env.SEED_DEMO !== 'true') return
  const properties = await pool.query('SELECT count(*)::int AS count FROM properties')
  if (properties.rows[0].count) return

  const landlord = await pool.query(
    `INSERT INTO landlords(full_legal_name,trading_name,correspondence_address,phone,email,rsw_registration_number,rsw_registration_start,rsw_registration_expiry,rsw_licence_number,rsw_licence_type,rsw_licence_expiry,training_completed,bank_name,bank_sort_code,bank_account_number)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id`,
    ['John Landlord','Smart Landlord Demo Portfolio','1 Cathedral Road, Cardiff','0333 0100200','owner@smartlandlord.local','RSW-REG-2026-1042','2026-04-01','2031-03-31','RSW-LIC-2026-2211','Full Licence','2029-08-31','Rent Smart Wales training completed 2026','Monzo','20-00-00','12345678']
  )
  const landlordId = landlord.rows[0].id

  const propertyRows = [
    ['12 Heol Y Ddraig','Pontcanna','Cardiff','CF11 9HA','Cardiff Council','Terraced house',3,1,'occupied',895],
    ['8 Bryn Road','Uplands','Swansea','SA2 0AU','Swansea Council','Semi-detached house',4,2,'occupied',750],
    ['15 Maes-y-Coed','St Julian’s','Newport','NP19 7GD','Newport Council','Flat',2,1,'occupied',695],
    ['3 Station Road','City Centre','Bangor','LL57 1NS','Gwynedd Council','Terraced house',2,1,'occupied',650],
    ['22 Park View','Rhosddu','Wrexham','LL11 2NY','Wrexham Council','Flat',1,1,'vacant',725]
  ]
  const propertyIds=[]
  for (const [address,area,town,postcode,authority,type,beds,baths,status,rent] of propertyRows) {
    const inserted=await pool.query(
      `INSERT INTO properties(landlord_id,address_line1,address_line2,town,county,postcode,local_authority,property_type,bedrooms,bathrooms,status,council_tax_band,insurance_expiry)
       VALUES($1,$2,$3,$4,'Wales',$5,$6,$7,$8,$9,$10,'D',current_date + 61) RETURNING id`,
      [landlordId,address,area,town,postcode,authority,type,beds,baths,status]
    )
    propertyIds.push(inserted.rows[0].id)
  }

  const tenantRows=[['Gareth','Williams','gareth@example.com'],['Lisa','Morgan','lisa@example.com'],['David','Jones','david@example.com'],['Emma','Davies','emma@example.com']]
  const tenantIds=[]
  for(const [first,last,email] of tenantRows){
    const tenant=await pool.query(`INSERT INTO tenants(first_name,surname,email,mobile,referencing_status,annual_income,right_to_rent_check,right_to_rent_result)
      VALUES($1,$2,$3,'07700 900001','passed',32000,current_date - 30,'passed') RETURNING id`,[first,last,email])
    tenantIds.push(tenant.rows[0].id)
  }

  const contractIds=[]
  for(let i=0;i<4;i++){
    const contract=await pool.query(
      `INSERT INTO contracts(contract_number,property_id,tenant_id,landlord_id,start_date,occupation_date,rent_amount,rent_frequency,rent_due_day,written_statement_sent,written_statement_signed,status)
       VALUES($1,$2,$3,$4,current_date - 120,current_date - 120,$5,'monthly',1,current_date - 125,current_date - 121,'active') RETURNING id`,
      [`OC-2026-${100+i}`,propertyIds[i],tenantIds[i],landlordId,propertyRows[i][9]]
    )
    contractIds.push(contract.rows[0].id)
    await pool.query(`INSERT INTO deposits(contract_id,amount,date_received,scheme,scheme_reference,date_protected,protection_deadline,prescribed_information_sent,acknowledgement_received,status)
      VALUES($1,$2,current_date - 122,'DPS',$3,current_date - 122,current_date - 92,current_date - 120,true,'protected')`,
      [contract.rows[0].id,Math.round(propertyRows[i][9]*1.5),`DPS-${900+i}`])
  }

  for(let i=0;i<4;i++){
    await pool.query(`INSERT INTO rent_payments(contract_id,due_date,amount_due,amount_received,payment_date,payment_method,payment_reference)
      VALUES($1,date_trunc('month',current_date)::date,$2,$3,current_date - 2,$4,$5)`,
      [contractIds[i],propertyRows[i][9],i<2?propertyRows[i][9]:0,i<2?(i?'Direct debit':'Bank transfer'):null,`RENT-${100+i}`])
    await pool.query(`INSERT INTO rent_payments(contract_id,due_date,amount_due,amount_received,payment_date,payment_method,payment_reference)
      VALUES($1,date_trunc('month',current_date + interval '1 month')::date,$2,0,null,null,null)`,
      [contractIds[i],propertyRows[i][9]])
  }

  await pool.query(`INSERT INTO compliance_records(property_id,category,title,status,inspection_date,expiry_date,provider_engineer,credential_number,certificate_number,rating,document_url)
    VALUES($1,'gas','Landlord Gas Safety Record','current',current_date-353,current_date+12,'Cardiff Gas Safe','551234','GS-2026-881','Pass','/demo/gas.pdf')`,[propertyIds[0]])
  await pool.query(`INSERT INTO compliance_records(property_id,category,title,status,inspection_date,expiry_date,provider_engineer,certificate_number,rating)
    VALUES($1,'eicr','Electrical Installation Condition Report','current',current_date-100,current_date+47,'Swansea Electrical','EICR-2026-441','Satisfactory')`,[propertyIds[1]])
  await pool.query(`INSERT INTO compliance_records(property_id,category,title,status,inspection_date,expiry_date,certificate_number,rating)
    VALUES($1,'epc','Energy Performance Certificate','current',current_date-300,current_date+28,'EPC-2026-221','C')`,[propertyIds[2]])
  await pool.query(`INSERT INTO compliance_records(property_id,category,title,status,inspection_date,expiry_date,findings,control_measures)
    VALUES($1,'legionella','Legionella risk assessment','current',current_date-330,current_date+90,'Low risk','Flush outlets; set hot water storage to 60C')`,[propertyIds[3]])

  await pool.query(`INSERT INTO safety_devices(property_id,device_type,location,alarm_type,installation_date,last_test_date,test_result,battery_status,replacement_due)
    VALUES($1,'smoke_alarm','Hallway','Mains interlinked',current_date-300,current_date-20,'Pass','Hardwired',current_date+365),
          ($1,'carbon_monoxide_alarm','Kitchen','10-year sealed',current_date-300,current_date-20,'Pass','Sealed battery',current_date+300)`,[propertyIds[0]])

  const contractor=await pool.query(`INSERT INTO contractors(name,company,phone,email,trade,public_liability_insurer,public_liability_expiry,gas_safe_number,gas_safe_expiry,preferred,hourly_rate)
    VALUES('Rhys Prosser','Prosser Heating','0333 2200330','jobs@prosserheating.example','Gas and heating','AXA',current_date+240,'551234',current_date+180,true,55) RETURNING id`)
  await pool.query(`INSERT INTO repairs(property_id,tenant_id,contractor_id,problem,category,priority,status,quote_amount,appointment_at,access_arrangements)
    VALUES($1,$2,$3,'No heating and no hot water','Heating','emergency','scheduled',280,current_date+1,'Tenant will be home from 9am')`,[propertyIds[0],tenantIds[0],contractor.rows[0].id])
  await pool.query(`INSERT INTO repairs(property_id,tenant_id,problem,category,priority,status)
    VALUES($1,$2,'Roof leak above rear bedroom','Roofing','high','quoted')`,[propertyIds[1],tenantIds[1]])

  await pool.query(`INSERT INTO invoices(invoice_number,invoice_type,landlord_id,property_id,issue_date,due_date,customer_name,customer_address,vat_rate,line_items,bank_details,terms)
    VALUES($1,'management_fee',$2,$3,current_date,current_date+14,'John Landlord','1 Cathedral Road, Cardiff',20,$4,'Monzo 20-00-00 12345678','Payment within 14 days')`,
    [`INV-${Date.now().toString().slice(-6)}`,landlordId,propertyIds[0],JSON.stringify([
      {description:'Management fee - June',quantity:1,unit_price:89.5,discount:0,vat_rate:20}
    ])])
  await pool.query(`INSERT INTO expenses(expense_date,supplier,category,description,property_id,landlord_id,net_amount,vat_amount,payment_method,paid_by,rechargeable,tax_category)
    VALUES(current_date-10,'Prosser Heating','Repairs','Emergency boiler repair',$1,$2,233.33,46.67,'Bank transfer','Landlord',false,'Repairs and maintenance')`,[propertyIds[0],landlordId])
}
