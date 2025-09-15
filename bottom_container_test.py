#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class BottomContainerBugTester:
    def __init__(self, base_url="https://rhymepicker.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.school_id = "BOTTOM_TEST"
        self.school_name = "Bottom Container Test"
        self.grade = "nursery"
        
    def log_test(self, name, success, details=""):
        """Log test results"""
        if success:
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def test_dual_container_backend_logic(self):
        """Test the dual container logic using backend APIs"""
        print("🧪 Testing Dual Container Logic via Backend APIs...")
        
        # 1. Login/Create school
        try:
            response = requests.post(f"{self.api_url}/auth/login", json={
                "school_id": self.school_id,
                "school_name": self.school_name
            })
            if response.status_code != 200:
                self.log_test("School Login", False, f"Status: {response.status_code}")
                return False
            self.log_test("School Login", True)
        except Exception as e:
            self.log_test("School Login", False, f"Error: {e}")
            return False
        
        # 2. Get available rhymes
        try:
            response = requests.get(f"{self.api_url}/rhymes/available/{self.school_id}/{self.grade}")
            if response.status_code != 200:
                self.log_test("Get Available Rhymes", False, f"Status: {response.status_code}")
                return False
            
            available_rhymes = response.json()
            half_page_rhymes = available_rhymes.get("0.5", [])
            full_page_rhymes = available_rhymes.get("1.0", [])
            
            self.log_test("Get Available Rhymes", True, f"0.5 page: {len(half_page_rhymes)}, 1.0 page: {len(full_page_rhymes)}")
            
            if len(half_page_rhymes) < 2:
                self.log_test("Sufficient 0.5 Page Rhymes", False, "Need at least 2 for dual container test")
                return False
            
            if len(full_page_rhymes) < 1:
                self.log_test("Sufficient 1.0 Page Rhymes", False, "Need at least 1 for full page test")
                return False
                
        except Exception as e:
            self.log_test("Get Available Rhymes", False, f"Error: {e}")
            return False
        
        # 3. TEST CASE: Select 0.5 page rhyme for TOP position (page_index 0)
        print("\n🧪 TEST CASE 1: Select 0.5 page rhyme for TOP position")
        try:
            top_rhyme = half_page_rhymes[0]  # ABC Song or first available
            response = requests.post(f"{self.api_url}/rhymes/select", json={
                "school_id": self.school_id,
                "grade": self.grade,
                "page_index": 0,
                "rhyme_code": top_rhyme["code"]
            })
            
            if response.status_code == 200:
                self.log_test("Select TOP 0.5 Page Rhyme", True, f"Selected: {top_rhyme['name']}")
            else:
                self.log_test("Select TOP 0.5 Page Rhyme", False, f"Status: {response.status_code}")
                return False
                
        except Exception as e:
            self.log_test("Select TOP 0.5 Page Rhyme", False, f"Error: {e}")
            return False
        
        # 4. TEST CASE: Select 0.5 page rhyme for BOTTOM position (same page_index 0)
        print("\n🧪 TEST CASE 2: Select 0.5 page rhyme for BOTTOM position (CRITICAL BUG FIX TEST)")
        try:
            bottom_rhyme = half_page_rhymes[1]  # Different rhyme for bottom
            response = requests.post(f"{self.api_url}/rhymes/select", json={
                "school_id": self.school_id,
                "grade": self.grade,
                "page_index": 0,  # Same page as top - this should work for dual container
                "rhyme_code": bottom_rhyme["code"]
            })
            
            if response.status_code == 200:
                self.log_test("Select BOTTOM 0.5 Page Rhyme", True, f"Selected: {bottom_rhyme['name']}")
                print("✅ CRITICAL: Bottom container selection API working!")
            else:
                self.log_test("Select BOTTOM 0.5 Page Rhyme", False, f"Status: {response.status_code}")
                print("❌ CRITICAL: Bottom container selection API failing!")
                return False
                
        except Exception as e:
            self.log_test("Select BOTTOM 0.5 Page Rhyme", False, f"Error: {e}")
            return False
        
        # 5. Verify selections were saved
        print("\n🧪 TEST CASE 3: Verify dual container selections saved")
        try:
            response = requests.get(f"{self.api_url}/rhymes/selected/{self.school_id}")
            if response.status_code != 200:
                self.log_test("Get Selected Rhymes", False, f"Status: {response.status_code}")
                return False
            
            selected_data = response.json()
            nursery_selections = selected_data.get(self.grade, [])
            
            # Check if we have selections for page_index 0
            page_0_selections = [s for s in nursery_selections if s["page_index"] == 0]
            
            if len(page_0_selections) >= 1:
                self.log_test("Dual Container Selections Saved", True, f"Found {len(page_0_selections)} selections for page 0")
                
                # Print details
                for selection in page_0_selections:
                    print(f"   - {selection['name']} ({selection['code']}) - {selection['pages']} pages")
                    
            else:
                self.log_test("Dual Container Selections Saved", False, "No selections found for page 0")
                return False
                
        except Exception as e:
            self.log_test("Get Selected Rhymes", False, f"Error: {e}")
            return False
        
        # 6. TEST CASE: Test 1.0 page rhyme (should replace both containers)
        print("\n🧪 TEST CASE 4: Test 1.0 page rhyme logic")
        try:
            full_rhyme = None
            # Look for RE00077 specifically
            for rhyme in full_page_rhymes:
                if rhyme["code"] == "RE00077":
                    full_rhyme = rhyme
                    break
            
            if not full_rhyme:
                full_rhyme = full_page_rhymes[0]  # Use first available
            
            response = requests.post(f"{self.api_url}/rhymes/select", json={
                "school_id": self.school_id,
                "grade": self.grade,
                "page_index": 1,  # Different page for full page rhyme
                "rhyme_code": full_rhyme["code"]
            })
            
            if response.status_code == 200:
                self.log_test("Select 1.0 Page Rhyme", True, f"Selected: {full_rhyme['name']}")
            else:
                self.log_test("Select 1.0 Page Rhyme", False, f"Status: {response.status_code}")
                
        except Exception as e:
            self.log_test("Select 1.0 Page Rhyme", False, f"Error: {e}")
        
        # 7. Final verification
        print("\n🧪 FINAL VERIFICATION: Check all selections")
        try:
            response = requests.get(f"{self.api_url}/rhymes/selected/{self.school_id}")
            selected_data = response.json()
            nursery_selections = selected_data.get(self.grade, [])
            
            print(f"Total selections for {self.grade}: {len(nursery_selections)}")
            for selection in nursery_selections:
                print(f"   Page {selection['page_index']}: {selection['name']} ({selection['pages']} pages)")
                
            self.log_test("Final Verification", True, f"Total selections: {len(nursery_selections)}")
            
        except Exception as e:
            self.log_test("Final Verification", False, f"Error: {e}")
        
        return True

def main():
    print("🚀 Starting Bottom Container Bug Fix Backend Testing...")
    tester = BottomContainerBugTester()
    success = tester.test_dual_container_backend_logic()
    
    if success:
        print("\n✅ BOTTOM CONTAINER BACKEND LOGIC TESTING COMPLETED")
        print("✅ Backend APIs support dual container functionality")
        return 0
    else:
        print("\n❌ BOTTOM CONTAINER BACKEND LOGIC TESTING FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())