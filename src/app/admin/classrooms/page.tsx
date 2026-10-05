import { CollectionManager } from "@/components/admin/collection-manager";

export default function ClassroomsPage() {
  return (
    <CollectionManager
      collectionName="classrooms"
      title="ห้องเรียน"
      codeHint="เช่น m4-1"
      deleteWarning="นักเรียนที่อยู่ในห้องนี้จะยังคงอ้างถึงรหัสเดิม ควรย้ายนักเรียนก่อนลบ"
    />
  );
}
